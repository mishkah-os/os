#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
الدمج المحسّن مع جميع المواقع
Improved Merge with All Positions
"""

import json
from pathlib import Path

class ImprovedMerger:
    def __init__(self, data_dir='qu'):
        self.data_dir = Path(data_dir)

    def merge_with_all_positions(self):
        """Merge with all positions for each word"""
        print("=" * 80)
        print("🔗 الدمج المحسّن - كل المواقع")
        print("=" * 80)

        # 1. Load final data
        print("\n1️⃣ تحميل البيانات المورفولوجية...")
        all_morphology = []
        for i in range(1, 16):
            file_path = self.data_dir / 'final' / f'final_{i:02d}.json'
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                all_morphology.extend(data)

        print(f"   ✓ تم تحميل {len(all_morphology):,} كلمة فريدة")

        # 2. Load ref data
        print("\n2️⃣ تحميل معلومات المواقع...")
        with open(self.data_dir / 'words-ref.json', 'r', encoding='utf-8') as f:
            words_ref = json.load(f)

        print(f"   ✓ تم تحميل {len(words_ref):,} عنصر")

        # 3. Parse positions from ref
        print("\n3️⃣ تحليل المواقع...")
        all_positions = []
        total_positions = 0

        for item in words_ref:
            if isinstance(item, list) and len(item) > 0:
                text = item[0]
                # Parse positions string
                try:
                    positions_str = '[' + text + ']'
                    positions = json.loads(positions_str)
                    all_positions.append(positions)
                    total_positions += len(positions)
                except:
                    all_positions.append([])
            else:
                all_positions.append([])

        print(f"   ✓ إجمالي المواقع: {total_positions:,}")

        # 4. Merge
        print("\n4️⃣ الدمج...")
        merged_data = []

        for i in range(len(all_morphology)):
            word, root, tags = all_morphology[i]
            positions = all_positions[i] if i < len(all_positions) else []

            entry = {
                'index': i + 1,
                'word': word,
                'root': root,
                'tags': tags,
                'positions': positions,
                'occurrence_count': len(positions)
            }
            merged_data.append(entry)

        print(f"   ✓ تم دمج {len(merged_data):,} كلمة")

        # 5. Save
        output_file = self.data_dir / 'merged_quran_complete.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(merged_data, f, ensure_ascii=False, indent=2)

        print(f"\n✅ تم الحفظ في: {output_file}")

        # 6. Statistics
        print("\n" + "=" * 80)
        print("📊 الإحصائيات:")
        print("=" * 80)
        print(f"كلمات فريدة: {len(merged_data):,}")
        print(f"إجمالي المواقع: {total_positions:,}")
        print(f"متوسط التكرار: {total_positions / len(merged_data):.2f} مرة/كلمة")

        # Top 10 most frequent
        sorted_data = sorted(merged_data, key=lambda x: x['occurrence_count'], reverse=True)
        print("\nأكثر 10 كلمات تكراراً:")
        for i, entry in enumerate(sorted_data[:10], 1):
            print(f"  {i:2d}. {entry['word']:15s} - {entry['occurrence_count']:4d} مرة")

        return True

if __name__ == '__main__':
    merger = ImprovedMerger()
    merger.merge_with_all_positions()
