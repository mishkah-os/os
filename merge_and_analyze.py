#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
سكريبت دمج وتحليل النص القرآني الكامل
Merge all final_XX.json files with words-ref.json and perform comprehensive analysis
"""

import json
import sys
from pathlib import Path
from collections import Counter, defaultdict
from typing import List, Dict, Tuple

class QuranMergeAnalyzer:
    def __init__(self, data_dir='qu'):
        self.data_dir = Path(data_dir)
        self.merged_data = []
        self.statistics = {}

    def load_and_merge(self):
        """Load all final files and merge with reference data"""
        print("=" * 80)
        print("🔄 دمج ملفات التحليل المورفولوجي")
        print("=" * 80)

        # 1. Load words-ref.json
        print("\n📂 تحميل words-ref.json...")
        ref_file = self.data_dir / 'words-ref.json'
        with open(ref_file, 'r', encoding='utf-8') as f:
            words_ref = json.load(f)
        print(f"✓ تم تحميل {len(words_ref)} موضع مرجعي")

        # 2. Load all final_XX.json files
        print("\n📂 تحميل ملفات final_XX.json...")
        all_morphology = []
        for i in range(1, 16):
            final_file = self.data_dir / 'final' / f'final_{i:02d}.json'
            if not final_file.exists():
                print(f"⚠ ملف غير موجود: {final_file}")
                continue

            with open(final_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                all_morphology.extend(data)
                print(f"  ✓ final_{i:02d}.json: {len(data)} كلمة")

        print(f"\n✓ إجمالي البيانات المورفولوجية: {len(all_morphology)} كلمة")

        # 3. Merge data
        print("\n🔗 دمج البيانات...")

        # Flatten words_ref to get sequential word positions
        word_positions = []
        for ref_group in words_ref:
            if isinstance(ref_group, list) and len(ref_group) > 0:
                if isinstance(ref_group[0], list):
                    # First element is a list of positions
                    word_positions.extend(ref_group[0])
                else:
                    # Single position
                    word_positions.append(ref_group)

        print(f"✓ عدد المواضع: {len(word_positions)}")
        print(f"✓ عدد البيانات المورفولوجية: {len(all_morphology)}")

        # Check if counts match
        if len(word_positions) != len(all_morphology):
            print(f"\n⚠ تحذير: عدم تطابق في الأعداد!")
            print(f"  المواضع: {len(word_positions)}")
            print(f"  البيانات المورفولوجية: {len(all_morphology)}")
            # Use minimum length to avoid index errors
            min_length = min(len(word_positions), len(all_morphology))
            print(f"  سيتم استخدام: {min_length} كلمة")
        else:
            min_length = len(all_morphology)
            print(f"✓ التطابق كامل: {min_length} كلمة")

        # Merge
        for i in range(min_length):
            position = word_positions[i] if i < len(word_positions) else [0, 0, 0]
            morphology = all_morphology[i] if i < len(all_morphology) else ["", "", ""]

            # Extract position info
            if isinstance(position, list) and len(position) == 3:
                surah, ayah, word_idx = position
            else:
                surah, ayah, word_idx = 0, 0, 0

            # Extract morphology info
            if isinstance(morphology, list) and len(morphology) >= 3:
                word, root, tags = morphology[0], morphology[1], morphology[2]
            else:
                word, root, tags = "", "", ""

            merged_entry = {
                'index': i + 1,
                'surah': surah,
                'ayah': ayah,
                'word_position': word_idx,
                'word': word,
                'root': root,
                'tags': tags
            }
            self.merged_data.append(merged_entry)

        print(f"\n✓ تم دمج {len(self.merged_data)} كلمة")

        # Save merged data
        output_file = self.data_dir / 'merged_quran_full.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(self.merged_data, f, ensure_ascii=False, indent=2)
        print(f"✓ تم حفظ البيانات المدمجة: {output_file}")

        return True

    def analyze_statistics(self):
        """Perform comprehensive statistical analysis"""
        print("\n" + "=" * 80)
        print("📊 التحليل الإحصائي الشامل")
        print("=" * 80)

        # Basic counts
        word_freq = Counter()
        root_freq = Counter()
        tag_freq = Counter()
        morpheme_freq = Counter()

        # Surah statistics
        surah_word_count = Counter()
        surah_root_diversity = defaultdict(set)

        # Tag co-occurrence
        tag_cooccurrence = defaultdict(Counter)

        # Root by tag
        root_by_tag = defaultdict(Counter)
        tag_by_root = defaultdict(Counter)

        print("\n🔢 حساب الإحصائيات...")

        for entry in self.merged_data:
            word = entry['word']
            root = entry['root']
            tags = entry['tags']
            surah = entry['surah']

            # Word frequency
            word_freq[word] += 1

            # Root frequency
            if root and root != 'NTWS':
                root_freq[root] += 1

            # Surah statistics
            surah_word_count[surah] += 1
            if root and root != 'NTWS':
                surah_root_diversity[surah].add(root)

            # Tag statistics
            if tags:
                tag_list = tags.split(',')
                for tag in tag_list:
                    tag = tag.strip()
                    tag_freq[tag] += 1

                    if root:
                        root_by_tag[tag][root] += 1
                        tag_by_root[root][tag] += 1

                # Tag co-occurrence
                for i, tag1 in enumerate(tag_list):
                    for tag2 in tag_list[i+1:]:
                        tag_cooccurrence[tag1.strip()][tag2.strip()] += 1

            # Morpheme frequency
            if '+' in word:
                morphemes = word.split('+')
                for morpheme in morphemes:
                    morpheme_freq[morpheme] += 1

        # Store statistics
        self.statistics = {
            'total_words': len(self.merged_data),
            'unique_words': len(word_freq),
            'unique_roots': len(root_freq),
            'unique_tags': len(tag_freq),
            'total_surahs': max(surah_word_count.keys()) if surah_word_count else 0,
            'word_freq': dict(word_freq.most_common(100)),
            'root_freq': dict(root_freq.most_common(100)),
            'tag_freq': dict(tag_freq.most_common()),
            'morpheme_freq': dict(morpheme_freq.most_common(50)),
            'surah_word_count': dict(surah_word_count),
            'surah_root_diversity': {k: len(v) for k, v in surah_root_diversity.items()},
            'root_by_tag': {k: dict(v.most_common(10)) for k, v in root_by_tag.items()},
            'tag_by_root': {k: dict(v) for k, v in list(tag_by_root.items())[:50]},
            'tag_cooccurrence': {k: dict(v.most_common(10)) for k, v in list(tag_cooccurrence.items())[:20]}
        }

        print(f"\n✓ الإحصائيات الأساسية:")
        print(f"  • إجمالي الكلمات: {self.statistics['total_words']:,}")
        print(f"  • كلمات فريدة: {self.statistics['unique_words']:,}")
        print(f"  • جذور فريدة: {self.statistics['unique_roots']:,}")
        print(f"  • تصنيفات فريدة: {self.statistics['unique_tags']}")
        print(f"  • عدد السور: {self.statistics['total_surahs']}")

        # Save statistics
        stats_file = self.data_dir / 'analysis_statistics.json'
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump(self.statistics, f, ensure_ascii=False, indent=2)
        print(f"\n✓ تم حفظ الإحصائيات: {stats_file}")

    def generate_text_report(self):
        """Generate detailed text report"""
        print("\n" + "=" * 80)
        print("📝 إنشاء التقرير النصي")
        print("=" * 80)

        report = []
        report.append("=" * 80)
        report.append("تقرير التحليل الشامل للنص القرآني الكامل")
        report.append("Comprehensive Analysis Report - Complete Quranic Text")
        report.append("=" * 80)
        report.append("")

        # Basic statistics
        report.append("📊 الإحصائيات الأساسية")
        report.append("-" * 80)
        report.append(f"إجمالي الكلمات: {self.statistics['total_words']:,}")
        report.append(f"كلمات فريدة: {self.statistics['unique_words']:,}")
        report.append(f"جذور فريدة: {self.statistics['unique_roots']:,}")
        report.append(f"تصنيفات مورفولوجية: {self.statistics['unique_tags']}")
        report.append(f"عدد السور: {self.statistics['total_surahs']}")
        report.append("")

        # Most frequent words
        report.append("🔤 أكثر الكلمات تكراراً (Top 20)")
        report.append("-" * 80)
        for i, (word, count) in enumerate(list(self.statistics['word_freq'].items())[:20], 1):
            report.append(f"{i:2d}. {word:30s} {count:6,} مرة")
        report.append("")

        # Most frequent roots
        report.append("🌱 أكثر الجذور تكراراً (Top 20)")
        report.append("-" * 80)
        for i, (root, count) in enumerate(list(self.statistics['root_freq'].items())[:20], 1):
            report.append(f"{i:2d}. {root:20s} {count:6,} مرة")
        report.append("")

        # Tag distribution
        report.append("🏷 توزيع التصنيفات المورفولوجية")
        report.append("-" * 80)
        for tag, count in sorted(self.statistics['tag_freq'].items(), key=lambda x: x[1], reverse=True):
            percentage = (count / self.statistics['total_words']) * 100
            report.append(f"{tag:10s} {count:6,} ({percentage:5.2f}%)")
        report.append("")

        # Surah statistics
        report.append("📖 إحصائيات السور (Top 20 حسب عدد الكلمات)")
        report.append("-" * 80)
        surah_stats = sorted(self.statistics['surah_word_count'].items(),
                            key=lambda x: x[1], reverse=True)[:20]
        for surah, word_count in surah_stats:
            root_diversity = self.statistics['surah_root_diversity'].get(surah, 0)
            report.append(f"السورة {surah:3d}: {word_count:5,} كلمة، {root_diversity:4d} جذر فريد")
        report.append("")

        report_text = "\n".join(report)

        # Save report
        report_file = self.data_dir / 'analysis_report.txt'
        with open(report_file, 'w', encoding='utf-8') as f:
            f.write(report_text)

        print(f"✓ تم إنشاء التقرير: {report_file}")
        print("\n" + report_text)

    def run(self):
        """Run complete analysis pipeline"""
        print("\n" + "=" * 80)
        print("🚀 بدء التحليل الشامل للنص القرآني")
        print("=" * 80)

        # Step 1: Merge data
        if not self.load_and_merge():
            print("❌ فشل في دمج البيانات")
            return False

        # Step 2: Analyze
        self.analyze_statistics()

        # Step 3: Generate report
        self.generate_text_report()

        print("\n" + "=" * 80)
        print("✅ اكتمل التحليل بنجاح")
        print("=" * 80)

        return True


if __name__ == '__main__':
    analyzer = QuranMergeAnalyzer()
    success = analyzer.run()
    sys.exit(0 if success else 1)
