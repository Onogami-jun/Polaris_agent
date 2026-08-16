#!/usr/bin/env python3
"""
Polaris CPU Trainer — Qwen2.5-0.5B + LoRA on CPU
Workaround until PyTorch 2.7+ supports RTX 5060 on Windows.
"""
import os, sys, json, argparse, time
from pathlib import Path

DATA_DIR = Path.home() / '.polaris' / 'training_data'
SFT_FILE = DATA_DIR / 'sft_distillation.jsonl'
DPO_FILE = DATA_DIR / 'dpo_preference_pairs.jsonl'
OUTPUT_DIR = Path('.') / 'polaris-opt'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sft-only', action='store_true')
    parser.add_argument('--dpo-only', action='store_true')
    parser.add_argument('--epochs', type=int, default=2)
    parser.add_argument('--samples', type=int, default=2000)
    parser.add_argument('--batch-size', type=int, default=1)
    parser.add_argument('--output', type=str, default=str(OUTPUT_DIR))
    args = parser.parse_args()

    print(f'{"="*56}')
    print(f'  Polaris CPU Trainer — Qwen2.5-0.5B + LoRA')
    print(f'{"="*56}')
    print(f'  Device:     CPU')
    print(f'  SFT samples: {args.samples}')
    print(f'  Epochs:      {args.epochs}')
    print(f'  Batch size:  {args.batch_size}')
    print(f'  Output:      {args.output}')
    print(f'{"="*56}\n')

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, DataCollatorForLanguageModeling
    from peft import LoraConfig, get_peft_model, TaskType
    from datasets import Dataset

    # ── Load data ──
    print('[1/4] Loading SFT data...')
    samples = []
    with open(SFT_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            if len(samples) >= args.samples: break
            try:
                obj = json.loads(line.strip())
                q = obj.get('question', '')
                a = obj.get('answer', '')
                r = obj.get('reasoning', '')
                if q and a:
                    text = q + '\n\n' + (r + '\n\n' if r else '') + a
                    samples.append(text)
            except: pass
    print(f'  Loaded {len(samples)} samples')

    # ── Tokenize ──
    print('[2/4] Loading model & tokenizer...')
    tokenizer = AutoTokenizer.from_pretrained('Qwen/Qwen2.5-0.5B', trust_remote_code=True)
    if tokenizer.pad_token is None: tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        'Qwen/Qwen2.5-0.5B',
        torch_dtype=torch.float32,
        device_map={'': 'cpu'},
        trust_remote_code=True,
    )

    # LoRA
    lora_config = LoraConfig(
        r=16, lora_alpha=16, target_modules=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj'],
        lora_dropout=0.05, bias='none', task_type=TaskType.CAUSAL_LM,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    model.config.use_cache = False

    def tokenize(examples):
        return tokenizer(examples['text'], truncation=True, max_length=1024, padding='max_length')

    ds = Dataset.from_dict({'text': samples})
    ds = ds.map(tokenize, batched=True, remove_columns=['text'])

    # ── Train ──
    print(f'[3/4] Training ({args.epochs} epochs, ~{len(samples)*args.epochs/100:.0f}s per 100 samples)...')
    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(OUTPUT_DIR / 'checkpoint'),
            per_device_train_batch_size=args.batch_size,
            num_train_epochs=args.epochs,
            learning_rate=3e-4,
            warmup_ratio=0.05,
            logging_steps=10,
            save_strategy='no',
            report_to='none',
            dataloader_num_workers=0,
        ),
        train_dataset=ds,
        data_collator=data_collator,
    )

    t0 = time.time()
    trainer.train()
    elapsed = time.time() - t0

    # ── Save ──
    print(f'[4/4] Saving model...')
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(out))
    tokenizer.save_pretrained(str(out))
    print(f'\n{"="*56}')
    print(f'  TRAINING COMPLETE ({elapsed:.0f}s)')
    print(f'  Model saved to: {out}')
    print(f'{"="*56}')

if __name__ == '__main__':
    main()
