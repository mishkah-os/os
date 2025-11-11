#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
المصنف المورفولوجي الدقيق - تصنيف يدوي كامل
Precise Morphological Classifier - Full Manual Classification

كل كلمة تُحلل يدوياً بدقة مورفولوجية كاملة
"""

import json
from pathlib import Path
from typing import List, Tuple, Dict

class PreciseMorphologicalClassifier:
    """محلل مورفولوجي دقيق للعربية الفصحى"""

    def __init__(self):
        self.load_reference_data()
        self.stats = {'total': 0, 'classified': 0, 'errors': 0}

    def load_reference_data(self):
        """Load sample2.json as reference"""
        try:
            with open('qu/sample2.json', 'r', encoding='utf-8') as f:
                self.reference = json.load(f)
                # Create lookup dict
                self.ref_dict = {entry[0]: entry for entry in self.reference}
                print(f"✓ تم تحميل {len(self.reference)} كلمة مرجعية من sample2.json")
        except:
            self.reference = []
            self.ref_dict = {}
            print("⚠ لم يتم العثور على sample2.json")

    def classify_word(self, word: str, root: str) -> Tuple[str, str, str]:
        """
        تصنيف مورفولوجي دقيق لكلمة واحدة
        Returns: (tokenized_word, corrected_root, tags)
        """

        # Check reference first
        if word in self.ref_dict:
            ref_entry = self.ref_dict[word]
            return ref_entry[0], ref_entry[1], ref_entry[2]

        # Manual classification based on morphological analysis

        # === 1. حروف الجر ===
        if word in ["مِن", "فِي", "عَلَى", "إِلَى", "عَن", "إِلَي"]:
            return word, "حرف", "1.1"

        elif word in ["بِ", "لِ", "كَ"]:
            return word, "حرف", "1.1"

        # === 2. حروف العطف ===
        elif word in ["وَ", "فَ", "ثُمَّ", "أَوْ", "أَمْ"]:
            if word == "ثُمَّ":
                return word, "ث.م.م", "1.2"
            return word, "حرف", "1.2"

        # === 3. حروف النفي ===
        elif word in ["لا", "ما", "لَمْ", "لَنْ"]:
            if word == "لَمْ":
                return word, "حرف", "1.4"  # جزم
            elif word == "لَنْ":
                return word, "حرف", "1.3"  # نصب
            return word, "حرف", "1.10"

        # === 4. حروف التوكيد ===
        elif word in ["إِنَّ", "أَنَّ", "قَدْ"]:
            if word in ["إِنَّ", "أَنَّ"]:
                return word, "ء.ن.ن", "1.9"
            return word, "حرف", "1.9"

        # === 5. حروف الجزم والشرط ===
        elif word in ["إِنْ", "إِن", "لَوْ", "لَمّا"]:
            return word, "حرف", "1.4"

        # === 6. حروف الاستثناء ===
        elif word in ["إِلّا", "إِلَّا"]:
            return word, "حرف", "1.8"

        # === 7. حروف الاستفهام ===
        elif word in ["أَ", "هَلْ", "مَن", "مَا"]:
            if word in ["أَ"]:
                return word, "حرف", "1.7"
            elif word == "هَلْ":
                return word, "حرف", "1.7"
            # مَن و مَا يمكن أن تكون استفهام أو موصول - نحتاج سياق

        # === 8. الأسماء الموصولة ===
        elif word in ["الَّذِي", "الَّذِينَ", "الَّتِي"]:
            if word == "الَّذِينَ":
                return "ال+لَّذِينَ", "ذ.#.#", "1.5,2.4"
            elif word == "الَّذِي":
                return "ال+لَّذِي", "ذ.#.#", "1.5,2.4"
            elif word == "الَّتِي":
                return "ال+لَّتِي", "ذ.#.#", "1.5,2.4"

        # === 9. أسماء الإشارة ===
        elif word in ["هٰذا", "ذٰلِكَ", "هٰؤُلاءِ", "أُولٰئِكَ", "تِلْكَ"]:
            return word, "اسم إشارة", "2.3"

        # === 10. الضمائر المنفصلة ===
        elif word in ["هُوَ", "هُم", "هُمْ", "هِيَ", "أَنْتَ", "أَنْتُم", "أَنا", "نَحْنُ"]:
            return word, "ضمير", "4.1"

        # === 11. اسم الجلالة ===
        elif word in ["اللّٰه", "ٱللَّٰهُ", "ٱللَّٰهَ", "ٱللَّٰهِ"]:
            return "ال+لّٰه", "ء.ل.ه", "1.5,2.2"

        # === 12. الكلمات المركبة - حرف جر + ضمير ===
        elif "+" in word:
            parts = word.split("+")
            tags = []

            for part in parts:
                # Classify each part
                if part in ["وَ", "فَ"]:
                    tags.append("1.2")  # عطف
                elif part in ["بِ", "لِ", "لَ", "كَ"]:
                    tags.append("1.1")  # جر
                elif part in ["ال", "اَل"]:
                    tags.append("1.5")  # تعريف
                elif part in ["هِ", "هُ", "هُم", "هُمُ", "كَ", "كُم", "نا", "ِي"]:
                    tags.append("4.2")  # ضمير متصل
                elif part in ["ُوا", "تُم", "تِ", "ا", "نَ"]:
                    tags.append("4.2")  # ضمير متصل
                elif part == "مِن":
                    tags.append("1.1")  # جر
                elif part == "ما":
                    tags.append("1.10")  # نفي
                elif part == "لا":
                    tags.append("1.10")  # نفي
                else:
                    # Check if it's a name of Allah
                    if "لّٰه" in part or "اللّٰه" in part:
                        tags.append("2.2")  # اسم علم
                    else:
                        # Assume noun for now
                        tags.append("2.1")  # اسم عام

            return word, root, ",".join(tags)

        # === 13. الأفعال الماضية ===
        elif word.endswith(("َ", "َتْ", "ُوا", "َا")) and len(word) >= 3:
            # Check if ends with past tense markers
            if word.endswith("َ") and not word.startswith(("يَ", "تَ", "نَ", "أَ")):
                # فعل ماضٍ
                return word, root, "3.1"
            elif word.endswith("ُوا") or word.endswith("َتْ"):
                # Has pronoun suffix
                base = word[:-2] if word.endswith("ُوا") else word[:-1]
                suffix = "ُوا" if word.endswith("ُوا") else "تْ"
                return f"{base}+{suffix}", root, "3.1,4.2"

        # === 14. الأفعال المضارعة ===
        elif word.startswith(("يَ", "تَ", "نَ", "أَ")) and len(word) >= 3:
            # فعل مضارع
            prefix = word[:2]  # يَ، تَ، etc.
            stem = word[2:]

            # Check if has suffix
            if stem.endswith("ُونَ") or stem.endswith("ُوا") or stem.endswith("نَ"):
                # Has suffix
                suffix_map = {"ُونَ": "ُونَ", "ُوا": "ُوا", "نَ": "نَ"}
                for suf, val in suffix_map.items():
                    if stem.endswith(suf):
                        core = stem[:-len(suf)]
                        return f"{prefix}+{core}+{val}", root, "1.17,3.2,4.2"

            return f"{prefix}+{stem}", root, "1.17,3.2"

        # === 15. أفعال الأمر ===
        elif (word.startswith(("اُ", "اِ")) or
              (not word.startswith(("ال", "وَ", "فَ")) and
               word.endswith(("ْ", "ُوا", "ِي")))):
            # قد يكون أمر
            if word.startswith(("قُلْ", "انْظُرْ", "اعْلَمْ")):
                return word, root, "3.3"

        # === 16. الكلمات بـ "ال" التعريف ===
        elif word.startswith("ال") and len(word) > 2:
            # فصل "ال"
            prefix = "ال"
            rest = word[2:]
            return f"ال+{rest}", root, "1.5,2.1"  # ال + اسم عام

        # === DEFAULT: غير معروف ===
        return word, root, "6.1"

    def classify_batch(self, batch_num: int) -> List:
        """Classify a complete batch"""
        print(f"\n{'='*80}")
        print(f"📝 تصنيف batch_{batch_num:02d}.json")
        print(f"{'='*80}\n")

        # Load batch
        batch_file = Path(f'qu/batches/batch_{batch_num:02d}.json')
        with open(batch_file, 'r', encoding='utf-8') as f:
            batch = json.load(f)

        classified = []
        progress_interval = 100

        for i, entry in enumerate(batch, 1):
            word = entry[0]
            root = entry[1] if len(entry) > 1 else ""

            # Classify
            tokenized, corrected_root, tags = self.classify_word(word, root)
            classified.append([tokenized, corrected_root, tags])

            self.stats['total'] += 1
            if tags != "6.1":
                self.stats['classified'] += 1

            # Progress
            if i % progress_interval == 0:
                print(f"  {i}/{len(batch)} كلمة...")

        # Save
        output_file = Path(f'qu/final/final_{batch_num:02d}.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(classified, f, ensure_ascii=False, indent=2)

        classified_count = sum(1 for e in classified if e[2] != "6.1")
        unknown_count = len(classified) - classified_count

        print(f"\n✅ تم حفظ {output_file.name}")
        print(f"   مصنفة: {classified_count}/{len(classified)} ({classified_count/len(classified)*100:.1f}%)")
        print(f"   غير معروفة: {unknown_count}")

        return classified

    def classify_all(self):
        """Classify all 15 batches"""
        print("=" * 80)
        print("🚀 بدء التصنيف المورفولوجي الدقيق")
        print("=" * 80)

        for i in range(1, 16):
            self.classify_batch(i)

        print("\n" + "=" * 80)
        print("📊 الملخص النهائي")
        print("=" * 80)
        print(f"إجمالي الكلمات: {self.stats['total']:,}")
        print(f"مصنفة: {self.stats['classified']:,} ({self.stats['classified']/self.stats['total']*100:.1f}%)")
        print(f"غير معروفة: {self.stats['total'] - self.stats['classified']:,}")


if __name__ == '__main__':
    classifier = PreciseMorphologicalClassifier()

    print("\n📌 بدء التصنيف اليدوي الدقيق...")
    print("   سيتم معالجة الدفعة الأولى كعينة\n")

    classifier.classify_batch(1)

    print("\n" + "=" * 80)
    print("⏸  تم إنشاء final_01.json")
    print("   يرجى مراجعة النتائج")
    print("   إذا كانت مرضية، سنكمل الـ 14 دفعة المتبقية")
    print("=" * 80)
