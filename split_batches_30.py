#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
تقسيم words-qu.json إلى 30 ملف
Split words-qu.json into 30 batch files for precise processing
"""

import json
from pathlib import Path

# Load words-qu.json
with open('qu/words-qu.json', 'r', encoding='utf-8') as f:
    words = json.load(f)

total_words = len(words)
batch_size = (total_words + 29) // 30  # Ceiling division for 30 batches

print("=" * 80)
print("📦 تقسيم الملف إلى 30 batch")
print("=" * 80)
print(f"إجمالي الكلمات: {total_words:,}")
print(f"حجم كل batch: ~{batch_size}")
print(f"\nجاري الإنشاء...\n")

# Split into 30 files
for i in range(30):
    start_idx = i * batch_size
    end_idx = min((i + 1) * batch_size, total_words)
    batch = words[start_idx:end_idx]

    if len(batch) == 0:  # Skip empty batches
        continue

    output_file = Path('qu/batches') / f'batch_{i+1:02d}.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)

    print(f"✓ batch_{i+1:02d}.json: {len(batch):4d} كلمة (من {start_idx+1} إلى {end_idx})")

print("\n" + "=" * 80)
print(f"✅ تم إنشاء 30 ملف batch في qu/batches/")
print("=" * 80)
