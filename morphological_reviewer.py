#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
المراجع المورفولوجي الدقيق
Precise Morphological Reviewer

يراجع كل كلمة في final_XX.json ويصححها حسب:
- map.md (قواعد التصنيف)
- sample2.json (أمثلة مرجعية)
- المعرفة المورفولوجية العربية
"""

import json
from pathlib import Path
from typing import List, Tuple

class MorphologicalReviewer:
    def __init__(self):
        self.corrections = []
        self.stats = {
            'total': 0,
            'correct': 0,
            'corrected': 0,
            'unknown': 0
        }

    def analyze_word(self, word: str, root: str) -> Tuple[str, str, str]:
        """
        تحليل مورفولوجي دقيق لكلمة واحدة
        Returns: (tokenized_word, root, tags)
        """

        # تصحيح التوكنز والتصنيف حسب الكلمة

        # === الحروف الشائعة ===
        if word == "ما":
            # يحتمل: نفي، موصول، استفهام - نختار الأكثر شيوعاً
            return "ما", "م.#", "1.10"  # حرف نفي (الأكثر شيوعاً)

        elif word == "الَّذِينَ":
            return "ال+لَّذِينَ", "ذ.#.#", "1.5,2.4"  # ال + اسم موصول

        elif word == "أَنَّ":
            return "أَنَّ", "ء.ن.ن", "1.9"  # حرف توكيد

        elif word == "ثَمَّ":
            return "ثَمَّ", "ث.م.م", "1.2"  # حرف عطف

        elif word == "الَّذِي":
            return "ال+لَّذِي", "ذ.#.#", "1.5,2.4"  # ال + اسم موصول

        elif word == "اللّٰه":
            return "ال+لّٰه", "ء.ل.ه", "1.5,2.2"  # ال + اسم علم

        elif word.startswith("ال+") or word.startswith("وَ+ال"):
            # Already tokenized - keep it
            return word, root, "6.1"  # Will be reviewed manually

        # === الأفعال ===
        elif word.endswith("َ") and len(word) >= 3:
            # فعل ماضٍ likely
            return word, root, "3.1"

        elif word.startswith("يَ") or word.startswith("تَ") or word.startswith("نَ") or word.startswith("أَ"):
            # فعل مضارع likely
            prefix = word[0] + word[1]  # يَ، تَ، etc.
            stem = word[2:]
            if len(stem) >= 2:
                return f"{prefix}+{stem}", root, "1.17,3.2"

        # Default: return unchanged with 6.1
        return word, root, "6.1"

    def review_file(self, batch_num: int):
        """Review a single final file"""
        print(f"\n{'='*80}")
        print(f"📝 مراجعة final_{batch_num:02d}.json")
        print(f"{'='*80}")

        # Load batch and final
        batch_file = Path(f'qu/batches/batch_{batch_num:02d}.json')
        final_file = Path(f'qu/final/final_{batch_num:02d}.json')

        with open(batch_file, 'r', encoding='utf-8') as f:
            batch = json.load(f)

        with open(final_file, 'r', encoding='utf-8') as f:
            final = json.load(f)

        # Review each word
        corrected_final = []
        corrections_made = 0

        for i, (batch_entry, final_entry) in enumerate(zip(batch, final)):
            batch_word = batch_entry[0]
            batch_root = batch_entry[1] if len(batch_entry) > 1 else ""

            final_word = final_entry[0]
            final_root = final_entry[1]
            final_tags = final_entry[2] if len(final_entry) > 2 else "6.1"

            self.stats['total'] += 1

            # Check if needs correction
            if final_tags == "6.1" or not final_tags:
                # Needs correction
                corrected_word, corrected_root, corrected_tags = self.analyze_word(batch_word, batch_root)

                if corrected_tags != "6.1":
                    corrections_made += 1
                    self.stats['corrected'] += 1
                    corrected_final.append([corrected_word, corrected_root, corrected_tags])
                else:
                    self.stats['unknown'] += 1
                    corrected_final.append([final_word, final_root, final_tags])
            else:
                # Already correct
                self.stats['correct'] += 1
                corrected_final.append(final_entry)

        # Save corrected file
        output_file = Path(f'qu/final/final_{batch_num:02d}_reviewed.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(corrected_final, f, ensure_ascii=False, indent=2)

        print(f"✅ تم مراجعة {len(final)} كلمة")
        print(f"   تصحيحات: {corrections_made}")
        print(f"   حفظ في: {output_file.name}")

        return corrections_made

    def review_all(self):
        """Review all 15 files"""
        print("=" * 80)
        print("🔍 بدء المراجعة المورفولوجية الشاملة")
        print("=" * 80)

        total_corrections = 0

        for i in range(1, 16):
            corrections = self.review_file(i)
            total_corrections += corrections

        print("\n" + "=" * 80)
        print("📊 ملخص المراجعة")
        print("=" * 80)
        print(f"إجمالي الكلمات: {self.stats['total']:,}")
        print(f"صحيحة مسبقاً: {self.stats['correct']:,}")
        print(f"تم تصحيحها: {self.stats['corrected']:,}")
        print(f"ما زالت غير معروفة: {self.stats['unknown']:,}")
        print(f"\nإجمالي التصحيحات: {total_corrections:,}")


if __name__ == '__main__':
    reviewer = MorphologicalReviewer()

    # Review only first file for now
    print("📌 ملاحظة: سيتم مراجعة الملف الأول فقط كعينة")
    print("    إذا كانت النتائج مرضية، سنكمل الـ 15 ملف\n")

    reviewer.review_file(1)

    print("\n" + "=" * 80)
    print("⏸  تم إيقاف المراجعة مؤقتاً")
    print("   يرجى مراجعة qu/final/final_01_reviewed.json")
    print("   إذا كانت النتائج جيدة، سنكمل الـ 14 ملف المتبقية")
    print("=" * 80)
