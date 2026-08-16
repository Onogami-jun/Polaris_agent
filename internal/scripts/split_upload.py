#!/usr/bin/env python3
"""
Split polaris-merged.zip into 50MB chunks for Supabase free tier upload.
Output: polaris_chunks/ directory with numbered parts.
"""
import os
from pathlib import Path

ZIP_FILE = Path('polaris-merged.zip')
CHUNK_DIR = Path('polaris_chunks')
CHUNK_SIZE = 50 * 1024 * 1024  # 50MB

def main():
    if not ZIP_FILE.exists():
        print(f'ERROR: {ZIP_FILE} not found. Run this first:')
        print(r'  powershell -Command "Compress-Archive -Path polaris-merged\* -DestinationPath polaris-merged.zip"')
        return

    size_mb = ZIP_FILE.stat().st_size / (1024**2)
    n_chunks = (ZIP_FILE.stat().st_size + CHUNK_SIZE - 1) // CHUNK_SIZE
    print(f'Splitting {ZIP_FILE} ({size_mb:.0f} MB) into {n_chunks} chunks of ~50MB...')

    CHUNK_DIR.mkdir(exist_ok=True)

    # Write manifest
    with open(CHUNK_DIR / 'manifest.json', 'w') as mf:
        mf.write('{"name":"polaris-merged.zip","chunks":' + str(n_chunks) + ',"total_size":' + str(ZIP_FILE.stat().st_size) + '}\n')

    with open(ZIP_FILE, 'rb') as f:
        for i in range(n_chunks):
            chunk_path = CHUNK_DIR / f'chunk_{i:03d}'
            data = f.read(CHUNK_SIZE)
            with open(chunk_path, 'wb') as cf:
                cf.write(data)
            print(f'  {i+1}/{n_chunks}: chunk_{i:03d} ({len(data)/(1024**2):.0f} MB)')

    print(f'\nDone! Upload all files in {CHUNK_DIR}/ to Supabase Storage bucket "models".')
    print(f'  bucket: models')
    print(f'  path prefix: chunks/')
    print(f'  files: manifest.json + chunk_000 through chunk_{n_chunks-1:03d}')

if __name__ == '__main__':
    main()
