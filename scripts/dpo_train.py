#!/usr/bin/env python3
"""
Polaris 小模型 DPO 微调脚本
─────────────────────────────
基于 unsloth + Qwen2.5-0.5B（极轻量，可在单张消费级GPU上跑）
数据: ~/.polaris/training_data/dpo_preference_pairs.jsonl
输出: ./polaris-opt-dpo/ (LoRA 适配器)

最小硬件要求:
  - GPU: 4GB+ VRAM (RTX 3060/4060 即可)
  - RAM: 8GB+
  - 磁盘: 2GB

用法:
  pip install unsloth torch transformers datasets
  python scripts/dpo_train.py
  # 或指定更多 epoch:
  python scripts/dpo_train.py --epochs 3 --batch_size 4
"""

import os, json, argparse
from pathlib import Path

DATA_DIR = Path.home() / '.polaris' / 'training_data'
DPO_FILE = DATA_DIR / 'dpo_preference_pairs.jsonl'
OUTPUT_DIR = Path('.') / 'polaris-opt-dpo'
MODEL_NAME = 'unsloth/Qwen2.5-0.5B'

def load_preference_pairs(path):
    """Load DPO preference pairs from JSONL"""
    pairs = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if obj.get('chosen') and obj.get('rejected'):
                    pairs.append({
                        'prompt': obj.get('question', ''),
                        'chosen': obj['chosen'],
                        'rejected': obj['rejected'],
                    })
            except json.JSONDecodeError:
                continue
    return pairs


def main():
    parser = argparse.ArgumentParser(description='Polaris DPO fine-tuning')
    parser.add_argument('--epochs', type=int, default=1, help='Training epochs')
    parser.add_argument('--batch_size', type=int, default=4, help='Batch size')
    parser.add_argument('--lr', type=float, default=5e-5, help='Learning rate')
    parser.add_argument('--max_length', type=int, default=1024, help='Max sequence length')
    parser.add_argument('--data_path', type=str, default=str(DPO_FILE), help='DPO data path')
    parser.add_argument('--model', type=str, default=MODEL_NAME, help='Base model name')
    parser.add_argument('--output', type=str, default=str(OUTPUT_DIR), help='Output directory')
    args = parser.parse_args()

    # ── Check data ──
    if not os.path.exists(args.data_path):
        print(f'[ERROR] Data file not found: {args.data_path}')
        print('Run: node scripts/generate_training_data.js first.')
        return

    pairs = load_preference_pairs(args.data_path)
    if len(pairs) < 10:
        print(f'[ERROR] Only {len(pairs)} DPO pairs found. Need at least 10.')
        print('Generate more data first.')
        return

    print(f'\n{"="*56}')
    print(f'  Polaris DPO Fine-Tuning')
    print(f'{"="*56}')
    print(f'  Base model: {args.model}')
    print(f'  DPO pairs:  {len(pairs)}')
    print(f'  Epochs:     {args.epochs}')
    print(f'  Batch size: {args.batch_size}')
    print(f'  Learning rate: {args.lr}')
    print(f'  Output:     {args.output}')
    print(f'{"="*56}\n')

    # ── Install deps if needed ──
    try:
        from unsloth import FastLanguageModel
        from unsloth import is_bfloat16_supported
        import torch
        from datasets import Dataset
        from trl import DPOTrainer
        from transformers import TrainingArguments
    except ImportError:
        print('[SETUP] Installing dependencies...')
        import subprocess
        subprocess.check_call([
            'pip', 'install', 'unsloth', 'torch', 'transformers',
            'datasets', 'trl', 'accelerate', '--quiet'
        ])
        print('[SETUP] Done. Continuing...\n')
        from unsloth import FastLanguageModel
        from unsloth import is_bfloat16_supported
        import torch
        from datasets import Dataset
        from trl import DPOTrainer
        from transformers import TrainingArguments

    # ── Load model ──
    print('[1/5] Loading base model...')
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=args.max_length,
        dtype=None,
        load_in_4bit=True,
    )

    # ── Prepare LoRA ──
    print('[2/5] Configuring LoRA...')
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj',
                        'gate_proj', 'up_proj', 'down_proj'],
        lora_alpha=16,
        lora_dropout=0,
        bias='none',
        use_gradient_checkpointing='unsloth',
        random_state=42,
    )

    # ── Format data for DPO ──
    print('[3/5] Formatting DPO data...')
    # DPO expects: prompt, chosen, rejected
    formatted = Dataset.from_list([
        {
            'prompt': p['prompt'],
            'chosen': p['chosen'],
            'rejected': p['rejected'],
        }
        for p in pairs
    ])

    def formatting_func(examples):
        return {
            'prompt': [tokenizer.apply_chat_template(
                [{'role': 'user', 'content': p}],
                tokenize=False, add_generation_prompt=True
            ) for p in examples['prompt']],
            'chosen': examples['chosen'],
            'rejected': examples['rejected'],
        }

    formatted = formatted.map(formatting_func, batched=True)

    # ── Train ──
    print('[4/5] Training...')
    trainer = DPOTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=formatted,
        args=TrainingArguments(
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=4,
            warmup_ratio=0.1,
            num_train_epochs=args.epochs,
            learning_rate=args.lr,
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=5,
            optim='adamw_8bit',
            weight_decay=0.01,
            lr_scheduler_type='linear',
            seed=42,
            output_dir=args.output,
            report_to='none',
        ),
        beta=0.1,
    )

    trainer.train()

    # ── Save ──
    print('[5/5] Saving model...')
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    model.save_pretrained_merged(str(args.output) + '_merged', tokenizer, save_method='merged_16bit')

    print(f'\n[OK] Model saved to {args.output}')
    print(f'  LoRA adapter: {args.output}')
    print(f'  Merged model: {args.output}_merged')
    print(f'\nTo use:')
    print(f'  from unsloth import FastLanguageModel')
    print(f'  model, tokenizer = FastLanguageModel.from_pretrained("{args.output}_merged")')


if __name__ == '__main__':
    main()
