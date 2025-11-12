#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
تقسيم words-qu.json إلى 15 ملف
Split words-qu.json into 15 batch files
"""

import json
from pathlib import Path

# Load words-qu.json
with open('qu/words-qu.json', 'r', encoding='utf-8') as f:
    words = json.load(f)

total_words = len(words)
batch_size = (total_words + 14) // 15  # Ceiling division

print(f"Total words: {total_words:,}")
print(f"Batch size: {batch_size}")
print(f"Creating 15 batch files...")

# Split into 15 files
for i in range(15):
    start_idx = i * batch_size
    end_idx = min((i + 1) * batch_size, total_words)
    batch = words[start_idx:end_idx]

    output_file = Path('qu/batches') / f'batch_{i+1:02d}.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)

    print(f"  ✓ batch_{i+1:02d}.json: {len(batch)} words")

print(f"\n✅ Done! Created 15 batch files in qu/batches/")
