#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تحسين المصنف المورفولوجي بتحليل sample2.json لفهم الأنماط
"""

import json
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path("/home/user/os")
SAMPLE2_FILE = BASE_DIR / "qu" / "sample2.json"

# قراءة sample2.json
with open(SAMPLE2_FILE, 'r', encoding='utf-8') as f:
    sample2 = json.load(f)

# تحليل الأنماط
patterns = defaultdict(list)

for entry in sample2:
    word, root, tags = entry[0], entry[1], entry[2]

    # تحليل الأفعال
    if "3.1" in tags:  # فعل ماضٍ
        patterns['past_verbs'].append((word, root, tags))
    elif "3.2" in tags:  # فعل مضارع
        patterns['present_verbs'].append((word, root, tags))
    elif "3.3" in tags:  # فعل أمر
        patterns['imperative_verbs'].append((word, root, tags))

    # تحليل الأسماء
    if "2.1" in tags:  # اسم عام
        patterns['common_nouns'].append((word, root, tags))
    elif "2.2" in tags:  # اسم علم
        patterns['proper_nouns'].append((word, root, tags))
    elif "2.5" in tags:  # مصدر
        patterns['masdar'].append((word, root, tags))

    # تحليل الصفات
    if "7.0" in tags:  # صفة
        patterns['adjectives'].append((word, root, tags))

# طباعة الإحصائيات
print("📊 تحليل الأنماط في sample2.json:")
print(f"\nالأفعال:")
print(f"  - أفعال ماضية: {len(patterns['past_verbs'])}")
print(f"  - أفعال مضارعة: {len(patterns['present_verbs'])}")
print(f"  - أفعال أمر: {len(patterns['imperative_verbs'])}")

print(f"\nالأسماء:")
print(f"  - أسماء عامة: {len(patterns['common_nouns'])}")
print(f"  - أسماء أعلام: {len(patterns['proper_nouns'])}")
print(f"  - مصادر: {len(patterns['masdar'])}")

print(f"\nالصفات: {len(patterns['adjectives'])}")

# عينات
print(f"\n📝 أمثلة للأفعال الماضية:")
for word, root, tags in patterns['past_verbs'][:10]:
    print(f"  '{word}' -> root: '{root}', tags: '{tags}'")

print(f"\n📝 أمثلة للأفعال المضارعة:")
for word, root, tags in patterns['present_verbs'][:10]:
    print(f"  '{word}' -> root: '{root}', tags: '{tags}'")

print(f"\n📝 أمثلة للأسماء العامة:")
for word, root, tags in patterns['common_nouns'][:10]:
    print(f"  '{word}' -> root: '{root}', tags: '{tags}'")
