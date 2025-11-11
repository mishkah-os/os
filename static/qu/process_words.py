#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import math
from pathlib import Path

# Load original file
with open('words-qu.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total words: {len(data)}")

# Calculate batch size for 15 files
batch_size = math.ceil(len(data) / 15)
print(f"Batch size: {batch_size}")

# Create batches directory if it doesn't exist
os.makedirs('batches', exist_ok=True)
os.makedirs('final', exist_ok=True)

# Split into 15 batches
for i in range(15):
    start_idx = i * batch_size
    end_idx = min((i + 1) * batch_size, len(data))
    batch = data[start_idx:end_idx]

    filename = f'batches/batch_{i+1:02d}.json'
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)

    print(f"Created {filename} with {len(batch)} entries")

print("\n✓ تم تقسيم الملف بنجاح إلى 15 ملف في مجلد batches")
