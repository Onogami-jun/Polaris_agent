#!/usr/bin/env python3
"""
Polaris DPO Fine-Tuning — launcher
Delegates to: internal/scripts/dpo_train.py

In public builds, this file serves as documentation only.
"""
import os, sys
internal_path = os.path.join(os.path.dirname(__file__), '..', 'internal', 'scripts', 'dpo_train.py')
if os.path.exists(internal_path):
    # Run the real training script
    with open(internal_path, 'r', encoding='utf-8') as f:
        code = f.read()
    exec(compile(code, internal_path, 'exec'), {'__name__': '__main__', '__file__': internal_path})
else:
    print('[Polaris] DPO training script is not available in public builds.')
    print('  This script requires the internal development module.')
    print('  See internal/scripts/dpo_train.py in the private repo.')
    sys.exit(0)
