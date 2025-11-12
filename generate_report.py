#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
إنشاء تقرير شامل لنتائج التصنيف المورفولوجي
"""

import json
from pathlib import Path
from collections import Counter, defaultdict

BASE_DIR = Path("/home/user/os")
FINAL_DIR = BASE_DIR / "qu" / "final"

# إحصائيات شاملة
stats = {
    'total_words': 0,
    'words_by_tag': defaultdict(int),
    'words_with_6.1': [],
    'words_by_batch': {},
    'unique_tags': set()
}

# معالجة كل batch
for i in range(1, 31):
    final_file = FINAL_DIR / f"final_{i:02d}.json"

    with open(final_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    batch_stats = {
        'total': len(data),
        'with_6.1': 0,
        'fully_classified': 0
    }

    for entry in data:
        word, root, tags = entry[0], entry[1], entry[2]
        stats['total_words'] += 1

        # تحليل التصنيفات
        tag_list = tags.split(',')
        for tag in tag_list:
            stats['words_by_tag'][tag] += 1
            stats['unique_tags'].add(tag)

        # كلمات تحتوي على 6.1
        if "6.1" in tags:
            batch_stats['with_6.1'] += 1
            if len(stats['words_with_6.1']) < 100:  # أول 100 مثال فقط
                stats['words_with_6.1'].append((word, root, tags))
        else:
            batch_stats['fully_classified'] += 1

    stats['words_by_batch'][f'batch_{i:02d}'] = batch_stats

# طباعة التقرير
print("=" * 80)
print("   تقرير شامل للتصنيف المورفولوجي للقرآن الكريم")
print("=" * 80)
print()

print("📊 الإحصائيات العامة:")
print(f"  • إجمالي الكلمات المعالجة: {stats['total_words']:,}")
print(f"  • عدد التصنيفات الفريدة: {len(stats['unique_tags'])}")

# حساب نسبة النجاح
words_with_unknown = stats['words_by_tag'].get('6.1', 0)
words_classified = stats['total_words'] - words_with_unknown
success_rate = (words_classified / stats['total_words'] * 100) if stats['total_words'] > 0 else 0

print(f"  • كلمات مصنفة بالكامل: {words_classified:,} ({success_rate:.2f}%)")
print(f"  • كلمات تحتاج مراجعة (6.1): {words_with_unknown:,} ({100-success_rate:.2f}%)")
print()

print("📈 توزيع التصنيفات:")
tag_descriptions = {
    '1.1': 'حرف جر',
    '1.2': 'حرف عطف',
    '1.3': 'حرف نصب',
    '1.4': 'حرف جزم',
    '1.5': 'ال التعريف',
    '1.7': 'حرف استفهام',
    '1.8': 'حرف استثناء',
    '1.9': 'حرف توكيد',
    '1.10': 'حرف نفي',
    '2.1': 'اسم عام',
    '2.2': 'اسم علم',
    '2.3': 'اسم إشارة',
    '2.4': 'اسم موصول',
    '2.5': 'مصدر',
    '3.1': 'فعل ماضٍ',
    '3.2': 'فعل مضارع',
    '3.3': 'فعل أمر',
    '4.1': 'ضمير منفصل',
    '4.2': 'ضمير متصل',
    '5.1': 'ظرف زمان',
    '5.2': 'ظرف مكان',
    '6.1': 'غير معروف',
    '7.0': 'صفة'
}

# ترتيب التصنيفات حسب العدد
sorted_tags = sorted(stats['words_by_tag'].items(), key=lambda x: x[1], reverse=True)

for tag, count in sorted_tags[:20]:  # أكثر 20 تصنيفاً شيوعاً
    desc = tag_descriptions.get(tag, 'غير معروف')
    percentage = (count / stats['total_words'] * 100)
    print(f"  • {tag} ({desc}): {count:,} ({percentage:.2f}%)")

print()
print("📁 إحصائيات الـ batches:")
for batch_name, batch_data in list(stats['words_by_batch'].items())[:5]:  # أول 5 batches
    total = batch_data['total']
    with_unknown = batch_data['with_6.1']
    classified = batch_data['fully_classified']
    success = (classified / total * 100) if total > 0 else 0
    print(f"  • {batch_name}: {classified}/{total} ({success:.1f}%)")

print(f"  ... (25 batch أخرى)")
print()

print("📝 أمثلة للكلمات المصنفة بنجاح:")
# قراءة أمثلة من final_01
with open(FINAL_DIR / "final_01.json", 'r', encoding='utf-8') as f:
    examples = json.load(f)

print("\n  من batch_01:")
count = 0
for entry in examples:
    word, root, tags = entry[0], entry[1], entry[2]
    if "6.1" not in tags and count < 10:
        print(f"    [{repr(word):30} {root:15} {tags}]")
        count += 1

print()
print("⚠️  أمثلة للكلمات التي تحتاج مراجعة (6.1):")
for i, (word, root, tags) in enumerate(stats['words_with_6.1'][:10], 1):
    print(f"  {i}. [{repr(word):30} {root:15} {tags}]")

print()
print("=" * 80)
print("   خلاصة:")
print(f"   • تم تصنيف {words_classified:,} كلمة بنجاح ({success_rate:.2f}%)")
print(f"   • يحتاج {words_with_unknown:,} كلمة للمراجعة اليدوية ({100-success_rate:.2f}%)")
print(f"   • جميع الملفات محفوظة في: {FINAL_DIR}")
print("=" * 80)
