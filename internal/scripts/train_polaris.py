#!/usr/bin/env python3
"""
Polaris Model Trainer v2.0 — Two-Phase: SFT → DPO
─────────────────────────────────────────────────
RTX 5060 8GB 专用优化配置。

Phase 1: SFT (Supervised Fine-Tuning)
  用 V4 蒸馏数据教模型推理模式 — 模仿老师的解题思路
  数据: ~/.polaris/training_data/sft_distillation.jsonl

Phase 2: DPO (Direct Preference Optimization)
  用偏好对做对齐 — 强化正确模式，压制错误模式
  数据: ~/.polaris/training_data/dpo_preference_pairs.jsonl

基座: Qwen2.5-7B (4-bit QLoRA, r=32)
               ↓ 不满足 8GB → 自动降级
           Qwen2.5-3B (4-bit QLoRA, r=32)

用法:
  python internal/scripts/train_polaris.py                  # 完整两阶段
  python internal/scripts/train_polaris.py --sft-only       # 仅 SFT
  python internal/scripts/train_polaris.py --dpo-only       # 仅 DPO
  python internal/scripts/train_polaris.py --model Qwen2.5-3B  # 指定基座
"""
import os, sys, json, argparse, gc, time
from pathlib import Path

DATA_DIR = Path.home() / '.polaris' / 'training_data'
SFT_FILE = DATA_DIR / 'sft_distillation.jsonl'
DPO_FILE = DATA_DIR / 'dpo_preference_pairs.jsonl'
OUTPUT_DIR = Path('.') / 'polaris-opt'

# ────────────────────────────────────────────────────────────
# Hardware detection
# ────────────────────────────────────────────────────────────
def detect_vram():
    """Detect GPU VRAM in GB."""
    try:
        import torch
        if torch.cuda.is_available():
            vram = torch.cuda.get_device_properties(0).total_mem / (1024**3)
            return round(vram, 1)
    except:
        pass
    return 0

def pick_model(vram_gb, preferred='Qwen2.5-7B'):
    """Pick the largest model that fits in VRAM with 4-bit QLoRA."""
    models = {
        'Qwen2.5-7B':  {'vram_4bit': 5.5, 'vram_activation': 2.5, 'name': 'unsloth/Qwen2.5-7B',          'strength': 'strong'},
        'Qwen2.5-3B':  {'vram_4bit': 2.5, 'vram_activation': 1.0, 'name': 'unsloth/Qwen2.5-3B',          'strength': 'medium'},
        'Qwen2.5-1.5B':{'vram_4bit': 1.5, 'vram_activation': 0.5, 'name': 'unsloth/Qwen2.5-1.5B',        'strength': 'basic'},
        'Qwen2.5-0.5B':{'vram_4bit': 0.5, 'vram_activation': 0.2, 'name': 'unsloth/Qwen2.5-0.5B',        'strength': 'minimal'},
    }
    # Try preferred first, then fall back in order
    order = ['Qwen2.5-7B', 'Qwen2.5-3B', 'Qwen2.5-1.5B', 'Qwen2.5-0.5B']
    if preferred in models:
        order = [preferred] + [m for m in order if m != preferred]

    for m in order:
        info = models[m]
        total_vram = info['vram_4bit'] + info['vram_activation']
        if vram_gb >= total_vram * 1.05:
            return info
    # Fallback to smallest
    return models['Qwen2.5-0.5B']

# ────────────────────────────────────────────────────────────
# Data loading
# ────────────────────────────────────────────────────────────
def load_sft_data(path, limit=None):
    """Load SFT data (question + reasoning + answer)."""
    samples = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                q = obj.get('question', '')
                r = obj.get('reasoning', '')
                a = obj.get('answer', '')
                if q and (r or a):
                    # Format: [REASONING] ... [SOLUTION] ...
                    full = ''
                    if r:
                        full += f'[REASONING]\n{r}\n\n'
                    full += f'[SOLUTION]\n{a}'
                    samples.append({'prompt': q, 'completion': full})
            except json.JSONDecodeError:
                continue
    if limit:
        samples = samples[:limit]
    return samples

def load_dpo_data(path, limit=None):
    """Load DPO preference pairs."""
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
    if limit:
        pairs = pairs[:limit]
    return pairs

# ────────────────────────────────────────────────────────────
# Training
# ────────────────────────────────────────────────────────────
def run_sft(model, tokenizer, train_data, args):
    """Phase 1: Supervised fine-tuning — learn to reason like V4."""
    from datasets import Dataset
    from trl import SFTTrainer
    from transformers import TrainingArguments

    print(f'[1/2] SFT: {len(train_data)} samples, {args.sft_epochs} epochs')

    ds = Dataset.from_list(train_data)

    def format_sft(examples):
        texts = []
        for prompt, completion in zip(examples['prompt'], examples['completion']):
            messages = [
                {'role': 'user', 'content': prompt},
                {'role': 'assistant', 'content': completion},
            ]
            texts.append(tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=False))
        return {'text': texts}

    ds = ds.map(format_sft, batched=True, remove_columns=ds.column_names)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds,
        args=TrainingArguments(
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            warmup_ratio=0.05,
            num_train_epochs=args.sft_epochs,
            learning_rate=2e-4,
            fp16=True,
            logging_steps=5,
            optim='adamw_8bit',
            weight_decay=0.01,
            lr_scheduler_type='cosine',
            seed=42,
            output_dir=str(OUTPUT_DIR / 'sft_checkpoint'),
            report_to='none',
            save_strategy='epoch',
        ),
        dataset_text_field='text',
        max_seq_length=args.max_length,
    )

    t0 = time.time()
    trainer.train()
    print(f'  SFT complete: {(time.time()-t0):.0f}s')
    return model, tokenizer

def run_dpo(model, tokenizer, train_data, args):
    """Phase 2: DPO — align preferences."""
    from datasets import Dataset
    from trl import DPOTrainer
    from transformers import TrainingArguments

    print(f'\n[2/2] DPO: {len(train_data)} pairs, {args.dpo_epochs} epochs')

    ds = Dataset.from_list(train_data)

    def format_dpo(examples):
        return {
            'prompt': [tokenizer.apply_chat_template(
                [{'role': 'user', 'content': p}],
                tokenize=False, add_generation_prompt=True
            ) for p in examples['prompt']],
            'chosen': examples['chosen'],
            'rejected': examples['rejected'],
        }

    ds = ds.map(format_dpo, batched=True)

    trainer = DPOTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=ds,
        args=TrainingArguments(
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            warmup_ratio=0.05,
            num_train_epochs=args.dpo_epochs,
            learning_rate=5e-5,
            fp16=True,
            logging_steps=5,
            optim='adamw_8bit',
            weight_decay=0.01,
            lr_scheduler_type='linear',
            seed=42,
            output_dir=str(OUTPUT_DIR / 'dpo_checkpoint'),
            report_to='none',
            save_strategy='epoch',
        ),
        beta=0.1,
        max_length=args.max_length,
    )

    t0 = time.time()
    trainer.train()
    print(f'  DPO complete: {(time.time()-t0):.0f}s')
    return model, tokenizer

# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Polaris Two-Phase Trainer')
    parser.add_argument('--model', type=str, default='Qwen2.5-7B', help='Base model')
    parser.add_argument('--sft-only', action='store_true')
    parser.add_argument('--dpo-only', action='store_true')
    parser.add_argument('--sft-epochs', type=int, default=3)
    parser.add_argument('--dpo-epochs', type=int, default=1)
    parser.add_argument('--max-length', type=int, default=1536)
    parser.add_argument('--sft-limit', type=int, default=0, help='Max SFT samples (0=all)')
    parser.add_argument('--dpo-limit', type=int, default=0, help='Max DPO pairs (0=all)')
    parser.add_argument('--output', type=str, default=str(OUTPUT_DIR))
    args = parser.parse_args()

    vram = detect_vram()
    model_info = pick_model(vram, args.model)

    print(f'{"="*56}')
    print(f'  Polaris Trainer v2.0 — Two-Phase SFT→DPO')
    print(f'{"="*56}')
    print(f'  GPU VRAM:    {vram:.1f} GB' if vram else '  GPU:         Not detected')
    print(f'  Model:       {model_info["name"].split("/")[-1]} ({model_info["strength"]})')
    print(f'  VRAM est:    {model_info["vram_4bit"]+.5:.1f} GB (4-bit + activations)')
    print(f'  Output:      {args.output}')
    print(f'{"="*56}\n')

    # ── Load data ──
    sft_data, dpo_data = [], []

    if not args.dpo_only:
        if not SFT_FILE.exists():
            print(f'[ERROR] SFT data not found: {SFT_FILE}')
            print('Run: python internal/scripts/distill_dataset.py 2000')
            sys.exit(1)
        sft_data = load_sft_data(SFT_FILE, args.sft_limit or None)
        if len(sft_data) < 10:
            print(f'[ERROR] Only {len(sft_data)} SFT samples. Need >= 10.')
            sys.exit(1)

    if not args.sft_only:
        if not DPO_FILE.exists():
            print(f'[WARN] DPO data not found: {DPO_FILE}. Skipping DPO.')
            args.sft_only = True
        else:
            dpo_data = load_dpo_data(DPO_FILE, args.dpo_limit or None)
            if len(dpo_data) < 10:
                print(f'[WARN] Only {len(dpo_data)} DPO pairs. Skipping DPO.')
                args.sft_only = True

    # ── Install deps ──
    try:
        from unsloth import FastLanguageModel
        import torch
    except ImportError:
        print('[SETUP] Installing dependencies...')
        import subprocess
        subprocess.check_call([
            'pip', 'install', 'unsloth', 'torch', 'transformers',
            'datasets', 'trl', 'accelerate', '--quiet',
        ])
        from unsloth import FastLanguageModel
        import torch

    # ── Load model ──
    print('[LOAD] Loading base model (4-bit QLoRA)...')
    t0 = time.time()
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_info['name'],
        max_seq_length=args.max_length,
        dtype=None,
        load_in_4bit=True,
    )
    print(f'  Loaded in {(time.time()-t0):.0f}s')

    # ── LoRA config ──
    model = FastLanguageModel.get_peft_model(
        model,
        r=32,
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj',
                        'gate_proj', 'up_proj', 'down_proj'],
        lora_alpha=32,
        lora_dropout=0.05,
        bias='none',
        use_gradient_checkpointing='unsloth',
        random_state=42,
        use_rslora=True,
    )
    print(f'  LoRA: r=32, alpha=32, rank-stabilized\n')

    # ── Train ──
    output_dir = Path(args.output)

    if not args.dpo_only and sft_data:
        model, tokenizer = run_sft(model, tokenizer, sft_data, args)

    if not args.sft_only and dpo_data:
        model, tokenizer = run_dpo(model, tokenizer, dpo_data, args)

    # ── Save ──
    print(f'\n[SAVE] Saving model...')
    lora_dir = output_dir / 'lora'
    merged_dir = output_dir / 'merged'

    model.save_pretrained(str(lora_dir))
    tokenizer.save_pretrained(str(lora_dir))

    print(f'  Merging LoRA into base model (16-bit)...')
    model.save_pretrained_merged(str(merged_dir), tokenizer, save_method='merged_16bit')

    lora_size = sum(f.stat().st_size for f in lora_dir.rglob('*') if f.is_file()) / (1024*1024)
    merged_size = sum(f.stat().st_size for f in merged_dir.rglob('*') if f.is_file()) / (1024*1024)

    print(f'\n{"="*56}')
    print(f'  TRAINING COMPLETE')
    print(f'{"="*56}')
    print(f'  LoRA adapter:  {lora_dir} ({lora_size:.0f} MB)')
    print(f'  Merged model:  {merged_dir} ({merged_size:.0f} MB)')
    print(f'')
    print(f'  To serve with llama.cpp:')
    print(f'  1. Convert to GGUF:')
    print(f'     python convert_hf_to_gguf.py {merged_dir} --outtype q4_k_m')
    print(f'  2. Start server:')
    print(f'     llama-server -m polaris-opt-q4_k_m.gguf --port 8080')
    print(f'  3. Polaris auto-detects at http://127.0.0.1:8080/health')


if __name__ == '__main__':
    main()
