#!/usr/bin/env python3
"""
Merge Polaris LoRA → full model → GGUF for local deployment.
"""
import sys, os, subprocess
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = 'Qwen/Qwen2.5-0.5B'
LORA_DIR = Path('.') / 'polaris-opt'
MERGED_DIR = Path('.') / 'polaris-merged'
GGUF_OUT = Path('.') / 'polaris-opt.Q4_K_M.gguf'

def main():
    print('[1/3] Merging LoRA into base model...')
    print(f'  Base: {BASE}')
    print(f'  LoRA: {LORA_DIR}')

    model = AutoModelForCausalLM.from_pretrained(
        BASE, dtype=torch.float16, device_map='cpu',
        trust_remote_code=True, local_files_only=True)
    model = PeftModel.from_pretrained(model, str(LORA_DIR))
    model = model.merge_and_unload()
    tokenizer = AutoTokenizer.from_pretrained(str(LORA_DIR), trust_remote_code=True)

    MERGED_DIR.mkdir(exist_ok=True)
    model.save_pretrained(str(MERGED_DIR), safe_serialization=True)
    tokenizer.save_pretrained(str(MERGED_DIR))
    print(f'  Merged model saved to: {MERGED_DIR}')

    # ── Convert to GGUF ──────────────────────────────────
    print('\n[2/3] Converting to GGUF (Q4_K_M)...')
    # Try to find llama.cpp conversion script
    convert_script = None
    search_paths = [
        Path.home() / 'llama.cpp' / 'convert_hf_to_gguf.py',
        Path('llama.cpp') / 'convert_hf_to_gguf.py',
    ]
    for sp in search_paths:
        if sp.exists():
            convert_script = sp
            break

    if convert_script:
        cmd = [
            sys.executable, str(convert_script),
            str(MERGED_DIR), '--outtype', 'q4_k_m', '--outfile', str(GGUF_OUT),
        ]
        subprocess.run(cmd, check=True)
    else:
        print('\n⚠ llama.cpp not found. Please install it to convert GGUF:')
        print('  git clone https://github.com/ggerganov/llama.cpp')
        print('  cd llama.cpp && cmake -B build && cmake --build build --config Release')
        print(f'\n  Then run: python llama.cpp/convert_hf_to_gguf.py {MERGED_DIR} --outtype q4_k_m')

    # ── Verify ───────────────────────────────────────────
    print('\n[3/3] Verifying...')
    if GGUF_OUT.exists():
        size_mb = GGUF_OUT.stat().st_size / (1024*1024)
        print(f'  GGUF model: {GGUF_OUT} ({size_mb:.0f} MB)')
        print(f'  Ready to use with: llama-server -m {GGUF_OUT} --port 8080')
    else:
        print('  GGUF not created yet. Follow instructions above.')

    print(f'\n  Merged HF model: {MERGED_DIR} (backup, can keep or delete)')

if __name__ == '__main__':
    main()
