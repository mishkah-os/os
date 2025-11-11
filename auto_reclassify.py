#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
سكريبت إعادة التصنيف التلقائي
Auto-Reclassification Script

يُعيد تصنيف الكلمات المصنفة كـ 6.1 (غير معروف) بناءً على قواعد مورفولوجية
"""

import json
import re
from pathlib import Path
from typing import List, Tuple

class AutoReclassifier:
    def __init__(self, data_dir='qu'):
        self.data_dir = Path(data_dir)

        # Classification rules
        self.rules = self.build_classification_rules()

        # Statistics
        self.stats = {
            'total_words': 0,
            'unknown_before': 0,
            'reclassified': 0,
            'still_unknown': 0
        }

    def build_classification_rules(self):
        """Build classification rules based on map.md"""
        return {
            # 1.0 الحروف
            'particles': {
                # حروف الجر
                'مِن': '1.1',
                'فِي': '1.1',
                'عَلَى': '1.1',
                'إِلَى': '1.1',
                'بِ': '1.1',
                'لِ': '1.1',
                'عَن': '1.1',
                'مَعَ': '1.1',
                'كَ': '1.21',  # حرف تشبيه

                # حروف العطف
                'وَ': '1.2',
                'فَ': '1.2',
                'ثُمَّ': '1.2',
                'أَوْ': '1.2',
                'أَمْ': '1.2',

                # حروف النصب والجزم
                'أَنْ': '1.3',
                'لَنْ': '1.3',
                'لَمْ': '1.4',
                'لَمّا': '1.4',
                'لَوْ': '1.4',

                # ال التعريف
                'ال': '1.5',

                # حرف النداء
                'يا': '1.6',

                # حروف الاستفهام
                'أَ': '1.7',
                'هَلْ': '1.7',
                'ءَ': '1.7',

                # حرف الاستثناء
                'إِلّا': '1.8',

                # حروف التوكيد
                'إِنَّ': '1.9',
                'أَنَّ': '1.9',
                'قَدْ': '1.9',
                'لَـ': '1.9',

                # حروف النفي
                'لا': '1.10',
                'ما': '1.10',
                'مَا': '1.10',

                # حرف الاستقبال
                'سَ': '1.12',
                'سَوْفَ': '1.12',

                # حرف الإضراب
                'بَلْ': '1.14',

                # حرف الاستدراك
                'لٰكِنْ': '1.18',
                'لٰكِن': '1.18',

                # حروف المضارعة
                'يَ': '1.17',
                'تَ': '1.17',
                'نَ': '1.17',
                'أَ': '1.17',
            },

            # 2.0 الأسماء
            'nouns': {
                'اللّٰه': '2.2',
                'مُوسَى': '2.2',
                'إِبْراهِيم': '2.2',
                'عِيسَى': '2.2',
                'مُحَمَّد': '2.2',
                'آدَم': '2.2',
                'نُوح': '2.2',
                'جَهَنَّم': '2.2',

                # أسماء إشارة
                'هٰذا': '2.3',
                'ذٰلِكَ': '2.3',
                'أُولٰئِكَ': '2.3',
                'تِلْكَ': '2.3',
                'هٰؤُلاءِ': '2.3',

                # أسماء موصولة
                'الَّذِي': '2.4',
                'الَّذِينَ': '2.4',
                'الَّتِي': '2.4',
                'مَن': '2.4',
            },

            # 4.0 الضمائر
            'pronouns': {
                # ضمائر منفصلة
                'هُوَ': '4.1',
                'هُم': '4.1',
                'هُمْ': '4.1',
                'أَنْتُم': '4.1',
                'أَنا': '4.1',
                'نَحْنُ': '4.1',
                'هِيَ': '4.1',
                'أَنْتَ': '4.1',

                # ضمائر متصلة
                'هُ': '4.2',
                'هِ': '4.2',
                'هِم': '4.2',
                'هُمُ': '4.2',
                'كَ': '4.2',
                'كُم': '4.2',
                'كُمْ': '4.2',
                'نا': '4.2',
                'ِي': '4.2',
                'ها': '4.2',
                'ُوا': '4.2',
                'تُم': '4.2',
                'تُمْ': '4.2',
                'تِ': '4.2',
            },

            # 5.0 الظروف
            'adverbs': {
                'إِذا': '5.1',
                'إِذْ': '5.1',
                'بَعْد': '5.1',
                'قِبَل': '5.1',
                'يَوْمَئِذٍ': '5.1',
                'حِين': '5.1',

                'عِنْد': '5.2',
                'ثَمَّ': '5.2',
                'فَوْق': '5.2',
                'تَحْت': '5.2',
                'بَيْنَ': '5.2',
                'دُون': '5.2',
            }
        }

    def classify_morpheme(self, morpheme: str, root: str = None) -> str:
        """Classify a single morpheme"""
        # Remove diacritics for comparison
        clean = self.remove_diacritics(morpheme)

        # Check particles
        for word, tag in self.rules['particles'].items():
            if self.remove_diacritics(word) == clean or morpheme == word:
                return tag

        # Check nouns
        for word, tag in self.rules['nouns'].items():
            if self.remove_diacritics(word) == clean or morpheme == word:
                return tag

        # Check pronouns
        for word, tag in self.rules['pronouns'].items():
            if self.remove_diacritics(word) == clean or morpheme == word:
                return tag

        # Check adverbs
        for word, tag in self.rules['adverbs'].items():
            if self.remove_diacritics(word) == clean or morpheme == word:
                return tag

        # Heuristic rules based on patterns

        # If has root and 3+ letters, likely a verb or noun
        if root and root not in ['NTWS', 'حرف', 'ظرف'] and len(clean) >= 3:
            # Check if it starts with verb prefixes
            if morpheme.startswith(('يَ', 'تَ', 'نَ', 'أَ')) and len(clean) >= 4:
                return '3.2'  # فعل مضارع

            # Check past tense patterns (typically ends with َ or no suffix)
            if re.search(r'[َ]$', morpheme):
                return '3.1'  # فعل ماضٍ

        # Default: keep as unknown
        return '6.1'

    def remove_diacritics(self, text: str) -> str:
        """Remove Arabic diacritics"""
        arabic_diacritics = re.compile(r'[\u0617-\u061A\u064B-\u0652]')
        return arabic_diacritics.sub('', text)

    def reclassify_word(self, word: str, root: str, tags: str) -> str:
        """Reclassify a word entry"""
        # If not unknown, keep as is
        if tags != '6.1':
            return tags

        # Split word into morphemes
        if '+' in word:
            morphemes = word.split('+')
        else:
            morphemes = [word]

        # Classify each morpheme
        new_tags = []
        for morpheme in morphemes:
            tag = self.classify_morpheme(morpheme, root)
            new_tags.append(tag)

        return ','.join(new_tags)

    def process_files(self):
        """Process all final_XX.json files and reclassify"""
        print("=" * 80)
        print("🔄 بدء إعادة التصنيف التلقائي")
        print("=" * 80)

        for i in range(1, 16):
            file_num = f'{i:02d}'
            input_file = self.data_dir / 'final' / f'final_{file_num}.json'

            if not input_file.exists():
                print(f"⚠ ملف غير موجود: {input_file}")
                continue

            print(f"\n📂 معالجة {input_file.name}...")

            # Load data
            with open(input_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Reclassify
            reclassified_data = []
            file_unknown_before = 0
            file_reclassified = 0

            for entry in data:
                if len(entry) < 3:
                    reclassified_data.append(entry)
                    continue

                word, root, tags = entry[0], entry[1], entry[2]

                self.stats['total_words'] += 1

                if tags == '6.1':
                    file_unknown_before += 1
                    self.stats['unknown_before'] += 1

                    # Reclassify
                    new_tags = self.reclassify_word(word, root, tags)

                    if new_tags != '6.1':
                        file_reclassified += 1
                        self.stats['reclassified'] += 1
                        reclassified_data.append([word, root, new_tags])
                    else:
                        self.stats['still_unknown'] += 1
                        reclassified_data.append(entry)
                else:
                    reclassified_data.append(entry)

            # Save
            output_file = self.data_dir / 'final' / f'final_{file_num}_reclassified.json'
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(reclassified_data, f, ensure_ascii=False, indent=2)

            print(f"  ✓ غير معروف قبل: {file_unknown_before}")
            print(f"  ✓ تم إعادة تصنيف: {file_reclassified}")
            print(f"  ✓ حُفظ في: {output_file.name}")

    def print_report(self):
        """Print final report"""
        print("\n" + "=" * 80)
        print("📊 التقرير النهائي")
        print("=" * 80)
        print(f"إجمالي الكلمات: {self.stats['total_words']:,}")
        print(f"غير معروف قبل: {self.stats['unknown_before']:,} ({(self.stats['unknown_before']/self.stats['total_words']*100):.2f}%)")
        print(f"تم إعادة تصنيف: {self.stats['reclassified']:,} ({(self.stats['reclassified']/self.stats['total_words']*100):.2f}%)")
        print(f"ما زال غير معروف: {self.stats['still_unknown']:,} ({(self.stats['still_unknown']/self.stats['total_words']*100):.2f}%)")
        print("=" * 80)

    def run(self):
        """Run reclassification"""
        self.process_files()
        self.print_report()


if __name__ == '__main__':
    classifier = AutoReclassifier()
    classifier.run()
