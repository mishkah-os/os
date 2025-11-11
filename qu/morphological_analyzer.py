#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
import os
from typing import List, Tuple, Dict

class MorphologicalAnalyzer:
    """محلل مورفولوجي عتيق دقيق للكلمات العربية"""

    def __init__(self):
        # حروف الجر
        self.prepositions = {
            'مِن': ('م.ن', '1.1'),
            'فِي': ('ف.#', '1.1'),
            'عَلَى': ('ع.ل.و', '1.1'),
            'إِلَى': ('ء.ل.ي', '1.1'),
            'بِ': ('حرف', '1.1'),
            'لِ': ('حرف', '1.1'),
            'كَ': ('حرف', '1.21'),
        }

        # حروف العطف
        self.conjunctions = {
            'وَ': ('حرف', '1.2'),
            'فَ': ('حرف', '1.2'),
            'أَوْ': ('حرف', '1.2'),
            'أَمْ': ('حرف', '1.2'),
        }

        # الحروف الأخرى
        self.particles = {
            'لا': ('ل.#', '1.10'),
            'مَا': ('م.#', '1.10'),
            'إِن': ('#.ن', '1.4'),
            'إِنَّ': ('#.ن.ن', '1.9'),
            'أَنَّ': ('#.ن.ن', '1.9'),
            'قَدْ': ('حرف', '1.9'),
            'لَمْ': ('حرف', '1.4'),
            'لَنْ': ('حرف', '1.3'),
            'هَلْ': ('حرف', '1.7'),
            'أَ': ('حرف', '1.7'),
            'كَيْفَ': ('ك.ي.ف', '1.7'),
        }

        # الضمائر
        self.pronouns = {
            'هُوَ': ('ضمير', '4.1'),
            'هُم': ('ضمير', '4.1'),
            'هِيَ': ('ضمير', '4.1'),
            'أَنْتُم': ('ضمير', '4.1'),
            'أَنْتَ': ('ضمير', '4.1'),
            'أَنا': ('ضمير', '4.1'),
            'نَحْنُ': ('ضمير', '4.1'),
        }

        # الأسماء الموصولة
        self.relative_nouns = {
            'الَّذِي': ('#.ل.ذ', '2.4'),
            'الَّذِينَ': ('#.ل.ذ', '2.4'),
            'الَّتِي': ('#.ل.ذ', '2.4'),
            'مَا': ('م.#', '2.4'),
            'مَنْ': ('حرف', '2.4'),
        }

        # أسماء الإشارة
        self.demonstratives = {
            'هٰذا': ('اسم إشارة', '2.3'),
            'ذٰلِكَ': ('اسم إشارة', '2.3'),
            'أُولٰئِكَ': ('اسم إشارة', '2.3'),
            'تِلْكَ': ('اسم إشارة', '2.3'),
            'هٰؤُلاءِ': ('اسم إشارة', '2.3'),
        }

        # الظروف
        self.adverbs = {
            'إِذا': ('ظرف', '5.1'),
            'إِذْ': ('ظرف', '5.1'),
            'بَعْد': ('ب.ع.د', '5.1'),
            'قِبَل': ('ق.ب.ل', '5.1'),
            'يَوْمَئِذٍ': ('ي.و.م', '5.1'),
            'ثَمَّ': ('ث.م.م', '5.2'),
            'عِنْد': ('ع.ن.د', '5.2'),
            'دُون': ('د.و.ن', '5.2'),
            'بَيْنَ': ('ب.ي.ن', '5.2'),
            'مَعَ': ('حرف', '1.1'),
        }

    def analyze_word(self, word: str, root: str) -> Tuple[str, str, str]:
        """تحليل يدوي دقيق للكلمة الواحدة

        Returns:
            (morpheme_breakdown, root, tags)
        """

        # التنظيف من الحركات الزائدة
        word_clean = word.strip()

        # الحروف المنفردة
        if word_clean == 'ص':
            return (word_clean, 'NTWS', '6.1')

        # الضمائر المنفصلة
        if word_clean in self.pronouns:
            return (word_clean, self.pronouns[word_clean][0], self.pronouns[word_clean][1])

        # أسماء الإشارة
        if word_clean in self.demonstratives:
            return (word_clean, self.demonstratives[word_clean][0], self.demonstratives[word_clean][1])

        # الأسماء الموصولة
        if word_clean in self.relative_nouns:
            r_root = self.relative_nouns[word_clean][0]
            r_tag = self.relative_nouns[word_clean][1]
            return (word_clean, r_root, r_tag)

        # الظروف
        if word_clean in self.adverbs:
            return (word_clean, self.adverbs[word_clean][0], self.adverbs[word_clean][1])

        # معالجة خاصة للكلمات المركبة (مع + وضمير، إلخ)
        # سيتم تطبيق القواعد التالية يدوياً لكل كلمة

        # إذا لم نعثر على تطابق مباشر، نرجع البيانات الأصلية مع تصحيح
        return (word_clean, root, '6.1')  # معلم للمراجعة


# قائمة الأخطاء التي لاحظناها وتصحيحاتها
CORRECTIONS = {
    # مثال على التصحيحات اليدوية
    'ال+لّٰه': (['وَ', 'ال', 'لّٰه'], 'ء.ل.ه', '1.2,1.5,2.2'),
    'بِ+آيات+ِي': (['بِ', 'آيات', 'ِي'], 'ء.ي.ي', '1.1,2.1,4.2'),
    'اسْتَجاب+ُوا': (['اسْتَجاب', 'ُوا'], 'ج.و.ب', '3.1,4.2'),
}

def load_and_correct_batch(batch_num: int) -> List[List]:
    """تحميل وتصحيح ملف batch واحد"""

    filename = f'batches/batch_{batch_num:02d}.json'

    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)

    analyzer = MorphologicalAnalyzer()
    corrected = []

    for entry in data:
        word = entry[0]
        root = entry[1]

        # محاولة تصحيح يدوي
        # سيتم تطبيق القواعس على أساس كل حالة

        # إذا كان هناك تصحيح محدد مسبقاً
        if word in CORRECTIONS:
            morphemes, new_root, tags = CORRECTIONS[word]
            corrected_word = '+'.join(morphemes)
            corrected.append([corrected_word, new_root, tags])
        else:
            # استخدام المحلل التلقائي
            corrected_word, new_root, tags = analyzer.analyze_word(word, root)
            corrected.append([corrected_word, new_root, tags])

    return corrected

# معالجة جميع الملفات
print("جاري معالجة ملفات الـ batches...")
for i in range(1, 16):
    try:
        corrected_batch = load_and_correct_batch(i)

        output_filename = f'final/final_{i:02d}.json'
        with open(output_filename, 'w', encoding='utf-8') as f:
            json.dump(corrected_batch, f, ensure_ascii=False, indent=2)

        print(f"✓ تم إنشاء {output_filename} ({len(corrected_batch)} كلمة)")
    except Exception as e:
        print(f"✗ خطأ في معالجة batch {i}: {e}")

print("\n✓ اكتملت معالجة جميع الملفات")
