#!/usr/bin/env python3
"""
Polaris Model Trainer — launcher
Delegates to: internal/scripts/train_polaris.py (Two-Phase SFT→DPO)

Usage:
  python scripts/dpo_train.py                  # Full training (SFT + DPO)
  python scripts/dpo_train.py --sft-only       # SFT only
  python scripts/dpo_train.py --dpo-only       # DPO only

In public builds, this file serves as documentation only.
"""
import os, sys, subprocess
internal_path = os.path.join(os.path.dirname(__file__), '..', 'internal', 'scripts', 'train_polaris.py')
if os.path.exists(internal_path):
    subprocess.run([sys.executable, internal_path] + sys.argv[1:])
else:
    print('[Polaris] Model trainer is not available in public builds.')
    print('  This script requires the internal development module.')
    sys.exit(0)
