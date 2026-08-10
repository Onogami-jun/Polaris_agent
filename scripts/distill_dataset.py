#!/usr/bin/env python3
"""
Polaris Distillation Data Generator — launcher
Delegates to: internal/scripts/distill_dataset.py

Usage:
  python scripts/distill_dataset.py 2000       # Generate 2000 V4-distilled samples
  python scripts/distill_dataset.py 100 --offline  # Test with algorithmic mode

In public builds, this file serves as documentation only.
"""
import os, sys, subprocess
internal_path = os.path.join(os.path.dirname(__file__), '..', 'internal', 'scripts', 'distill_dataset.py')
if os.path.exists(internal_path):
    subprocess.run([sys.executable, internal_path] + sys.argv[1:])
else:
    print('[Polaris] Distillation data generator is not available in public builds.')
    print('  This script requires the internal development module.')
    sys.exit(0)
