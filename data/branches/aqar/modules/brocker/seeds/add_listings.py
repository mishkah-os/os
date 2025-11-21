#!/usr/bin/env python3
import json
from datetime import datetime

# Load existing seeds
with open('initial.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# New units to add
new_units = [
    {
        "id": "unit-nour-1501",
        "project_id": "proj-nour-heights",
        "building_id": "building-nour-a",
        "unit_type_id": "unit-type-apartment",
        "unit_number": "15-01",
        "floor": 15,
        "bedrooms": 2,
        "bathrooms": 2,
        "area": 120,
        "direction": "شمال",
        "status": "available",
        "description": "شقة 2 غرف مع إطلالة على النيل، تشطيب ممتاز",
        "created_at": "2024-10-15T08:00:00Z",
        "updated_at": "2024-11-30T10:00:00Z",
        "lang": "ar"
    },
    {
        "id": "unit-nour-0805",
        "project_id": "proj-nour-heights",
        "building_id": "building-nour-a",
        "unit_type_id": "unit-type-apartment",
        "unit_number": "08-05",
        "floor": 8,
        "bedrooms": 1,
        "bathrooms": 1,
        "area": 85,
        "direction": "جنوب",
        "status": "available",
        "description": "استوديو واسع مع بلكونة كبيرة",
        "created_at": "2024-09-20T08:00:00Z",
        "updated_at": "2024-11-30T10:00:00Z",
        "lang": "ar"
    },
    {
        "id": "unit-hayat-villa08",
        "project_id": "proj-hayat-villas",
        "building_id": "building-hayat-b",
        "unit_type_id": "unit-type-villa",
        "unit_number": "V-08",
        "floor": 0,
        "bedrooms": 5,
        "bathrooms": 4,
        "area": 450,
        "direction": "غرب",
        "status": "available",
        "description": "فيلا فاخرة مع حمام سباحة خاص",
        "created_at": "2024-08-10T08:00:00Z",
        "updated_at": "2024-11-30T10:00:00Z",
        "lang": "ar"
    },
    {
        "id": "unit-capital-office-b2",
        "project_id": "proj-capital-biz",
        "building_id": "building-capital-biz",
        "unit_type_id": "unit-type-retail",
        "unit_number": "B2-05",
        "floor": 2,
        "bedrooms": 0,
        "bathrooms": 2,
        "area": 180,
        "direction": "شمال",
        "status": "available",
        "description": "مكتب تجاري في برج أعمال حديث",
        "created_at": "2024-07-15T08:00:00Z",
        "updated_at": "2024-11-30T10:00:00Z",
        "lang": "ar"
    },
    {
        "id": "unit-nour-2003",
        "project_id": "proj-nour-heights",
        "building_id": "building-nour-a",
        "unit_type_id": "unit-type-apartment",
        "unit_number": "20-03",
        "floor": 20,
        "bedrooms": 4,
        "bathrooms": 3,
        "area": 210,
        "direction": "شرق",
        "status": "available",
        "description": "بنتهاوس مع روف خاص وجاكوزي",
        "created_at": "2024-11-01T08:00:00Z",
        "updated_at": "2024-11-30T10:00:00Z",
        "lang": "ar"
    }
]

# New unit_media
new_media = [
    # For unit-nour-1501
    {
        "id": "media-nour-1501-1",
        "unit_id": "unit-nour-1501",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?auto=format&fit=crop&w=1400&q=80",
        "description": "غرفة معيشة عصرية",
        "priority": 1
    },
    {
        "id": "media-nour-1501-2",
        "unit_id": "unit-nour-1501",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1400&q=80",
        "description": "إطلالة على النيل",
        "priority": 2
    },
    # For unit-nour-0805
    {
        "id": "media-nour-0805-1",
        "unit_id": "unit-nour-0805",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1400&q=80",
        "description": "استوديو مفتوح",
        "priority": 1
    },
    # For unit-hayat-villa08
    {
        "id": "media-hayat-villa08-1",
        "unit_id": "unit-hayat-villa08",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1400&q=80",
        "description": "فيلا فاخرة",
        "priority": 1
    },
    {
        "id": "media-hayat-villa08-2",
        "unit_id": "unit-hayat-villa08",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1613977257592-4871e5fcd7c4?auto=format&fit=crop&w=1400&q=80",
        "description": "حمام سباحة خاص",
        "priority": 2
    },
    # For unit-capital-office-b2
    {
        "id": "media-capital-office-b2-1",
        "unit_id": "unit-capital-office-b2",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80",
        "description": "مكتب حديث",
        "priority": 1
    },
    # For unit-nour-2003
    {
        "id": "media-nour-2003-1",
        "unit_id": "unit-nour-2003",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80",
        "description": "بنتهاوس فاخر",
        "priority": 1
    },
    {
        "id": "media-nour-2003-2",
        "unit_id": "unit-nour-2003",
        "media_type": "image",
        "url": "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=80",
        "description": "روف بانورامي",
        "priority": 2
    }
]

# New listings
new_listings = [
    # Sale listings
    {
        "id": "listing-nour-1501-sale",
        "unit_id": "unit-nour-1501",
        "broker_id": "broker-rahma",
        "listing_type": "sale",
        "listing_status": "active",
        "price_amount": 2950000,
        "currency": "EGP",
        "price_period": "one_time",
        "available_from": "2025-02-01",
        "security_deposit": None,
        "created_at": "2024-11-15T09:30:00Z",
        "lang": "ar",
        "headline": "شقة 2 غرف بإطلالة على النيل",
        "excerpt": "120م بتشطيب سوبر لوكس وإطلالة مباشرة",
        "region_id": "region-new-cairo",
        "primary_media_id": "media-nour-1501-1",
        "tags": ["إطلالة نيل", "تشطيب سوبر لوكس"],
        "highlights": [{"label": "المقدم", "value": "15%"}, {"label": "خطة سداد", "value": "5 سنوات"}],
        "featured_order": 5,
        "primary_highlight": "إطلالة نيل مباشرة",
        "updated_at": "2024-11-30T10:00:00Z"
    },
    {
        "id": "listing-hayat-villa08-sale",
        "unit_id": "unit-hayat-villa08",
        "broker_id": "broker-youssef",
        "listing_type": "sale",
        "listing_status": "active",
        "price_amount": 18500000,
        "currency": "EGP",
        "price_period": "one_time",
        "available_from": "2025-03-15",
        "security_deposit": None,
        "created_at": "2024-10-20T10:00:00Z",
        "lang": "ar",
        "headline": "فيلا فاخرة مع حمام سباحة",
        "excerpt": "450م مع حديقة 200م وحمام سباحة خاص",
        "region_id": "region-zayed",
        "primary_media_id": "media-hayat-villa08-1",
        "tags": ["حمام سباحة", "حديقة كبيرة"],
        "highlights": [{"label": "الدور", "value": "دورين"}, {"label": "مساحة الأرض", "value": "650م"}],
        "featured_order": 6,
        "primary_highlight": "حمام سباحة خاص",
        "updated_at": "2024-11-30T10:00:00Z"
    },
    # Rent listings
    {
        "id": "listing-nour-0805-rent",
        "unit_id": "unit-nour-0805",
        "broker_id": "broker-rahma",
        "listing_type": "rent",
        "listing_status": "active",
        "price_amount": 18000,
        "currency": "EGP",
        "price_period": "monthly",
        "available_from": "2025-01-10",
        "security_deposit": 36000,
        "created_at": "2024-11-12T09:30:00Z",
        "lang": "ar",
        "headline": "استوديو مفروش للإيجار",
        "excerpt": "85م مفروش بالكامل مع بلكونة واسعة",
        "region_id": "region-new-cairo",
        "primary_media_id": "media-nour-0805-1",
        "tags": ["مفروش", "بلكونة"],
        "highlights": [{"label": "الصيانة", "value": "شاملة"}],
        "featured_order": 7,
        "primary_highlight": "مفروش بالكامل",
        "updated_at": "2024-11-30T10:00:00Z"
    },
    {
        "id": "listing-capital-office-rent",
        "unit_id": "unit-capital-office-b2",
        "broker_id": "broker-salma",
        "listing_type": "rent",
        "listing_status": "active",
        "price_amount": 28000,
        "currency": "EGP",
        "price_period": "monthly",
        "available_from": "2025-01-01",
        "security_deposit": 56000,
        "created_at": "2024-10-25T10:00:00Z",
        "lang": "ar",
        "headline": "مكتب تجاري في برج أعمال",
        "excerpt": "180م مع إطلالة رائعة وخدمات متكاملة",
        "region_id": "region-capital",
        "primary_media_id": "media-capital-office-b2-1",
        "tags": ["خدمات", "إطلالة"],
        "highlights": [{"label": "موقف", "value": "3 سيارات"}],
        "featured_order": 8,
        "primary_highlight": "برج أعمال حديث",
        "updated_at": "2024-11-30T10:00:00Z"
    },
    # Lease listing
    {
        "id": "listing-nour-2003-lease",
        "unit_id": "unit-nour-2003",
        "broker_id": "broker-rahma",
        "listing_type": "lease",
        "listing_status": "active",
        "price_amount": 95000,
        "currency": "EGP",
        "price_period": "monthly",
        "available_from": "2025-02-01",
        "security_deposit": 285000,
        "created_at": "2024-11-18T09:30:00Z",
        "lang": "ar",
        "headline": "بنتهاوس مع روف خاص",
        "excerpt": "210م + روف 100م مع جاكوزي وإطلالة بانورامية",
        "region_id": "region-new-cairo",
        "primary_media_id": "media-nour-2003-1",
        "tags": ["روف", "جاكوزي", "بنتهاوس"],
        "highlights": [{"label": "عقد", "value": "سنتان"}, {"label": "روف", "value": "100م"}],
        "featured_order": 9,
        "primary_highlight": "روف خاص",
        "updated_at": "2024-11-30T10:00:00Z"
    },
    # Short-stay listing
    {
        "id": "listing-nour-1501-short",
        "unit_id": "unit-nour-1501",
        "broker_id": "broker-youssef",
        "listing_type": "short-stay",
        "listing_status": "active",
        "price_amount": 1500,
        "currency": "EGP",
        "price_period": "daily",
        "available_from": "2024-12-20",
        "security_deposit": 3000,
        "created_at": "2024-11-20T10:00:00Z",
        "lang": "ar",
        "headline": "إيجار يومي شقة مفروشة",
        "excerpt": "120م مفروشة فندقي للإيجار اليومي/الأسبوعي",
        "region_id": "region-new-cairo",
        "primary_media_id": "media-nour-1501-1",
        "tags": ["إيجار يومي", "مفروش فندقي"],
        "highlights": [{"label": "الحد الأدنى", "value": "3 أيام"}],
        "featured_order": 10,
        "primary_highlight": "إيجار يومي",
        "updated_at": "2024-11-30T10:00:00Z"
    }
]

# Add English translations
new_listings_lang = [
    {
        "id": "listing-nour-1501-sale-en",
        "entity_type": "listings",
        "entity_id": "listing-nour-1501-sale",
        "field": "headline",
        "lang": "en",
        "text": "2 Bedroom Apartment with Nile View",
        "created_at": "2024-11-15T09:30:00Z"
    },
    {
        "id": "listing-nour-1501-sale-en-excerpt",
        "entity_type": "listings",
        "entity_id": "listing-nour-1501-sale",
        "field": "excerpt",
        "lang": "en",
        "text": "120sqm super lux finishing with direct view",
        "created_at": "2024-11-15T09:30:00Z"
    },
    {
        "id": "listing-hayat-villa08-sale-en",
        "entity_type": "listings",
        "entity_id": "listing-hayat-villa08-sale",
        "field": "headline",
        "lang": "en",
        "text": "Luxury Villa with Private Pool",
        "created_at": "2024-10-20T10:00:00Z"
    },
    {
        "id": "listing-hayat-villa08-sale-en-excerpt",
        "entity_type": "listings",
        "entity_id": "listing-hayat-villa08-sale",
        "field": "excerpt",
        "lang": "en",
        "text": "450sqm with 200sqm garden and private pool",
        "created_at": "2024-10-20T10:00:00Z"
    },
    {
        "id": "listing-nour-0805-rent-en",
        "entity_type": "listings",
        "entity_id": "listing-nour-0805-rent",
        "field": "headline",
        "lang": "en",
        "text": "Furnished Studio for Rent",
        "created_at": "2024-11-12T09:30:00Z"
    },
    {
        "id": "listing-nour-0805-rent-en-excerpt",
        "entity_type": "listings",
        "entity_id": "listing-nour-0805-rent",
        "field": "excerpt",
        "lang": "en",
        "text": "85sqm fully furnished with spacious balcony",
        "created_at": "2024-11-12T09:30:00Z"
    },
    {
        "id": "listing-capital-office-rent-en",
        "entity_type": "listings",
        "entity_id": "listing-capital-office-rent",
        "field": "headline",
        "lang": "en",
        "text": "Commercial Office in Business Tower",
        "created_at": "2024-10-25T10:00:00Z"
    },
    {
        "id": "listing-capital-office-rent-en-excerpt",
        "entity_type": "listings",
        "entity_id": "listing-capital-office-rent",
        "field": "excerpt",
        "lang": "en",
        "text": "180sqm with great view and full services",
        "created_at": "2024-10-25T10:00:00Z"
    },
    {
        "id": "listing-nour-2003-lease-en",
        "entity_type": "listings",
        "entity_id": "listing-nour-2003-lease",
        "field": "headline",
        "lang": "en",
        "text": "Penthouse with Private Roof",
        "created_at": "2024-11-18T09:30:00Z"
    },
    {
        "id": "listing-nour-2003-lease-en-excerpt",
        "entity_type": "listings",
        "entity_id": "listing-nour-2003-lease",
        "field": "excerpt",
        "lang": "en",
        "text": "210sqm + 100sqm roof with jacuzzi and panoramic view",
        "created_at": "2024-11-18T09:30:00Z"
    },
    {
        "id": "listing-nour-1501-short-en",
        "entity_type": "listings",
        "entity_id": "listing-nour-1501-short",
        "field": "headline",
        "lang": "en",
        "text": "Daily Rental Furnished Apartment",
        "created_at": "2024-11-20T10:00:00Z"
    },
    {
        "id": "listing-nour-1501-short-en-excerpt",
        "entity_type": "listings",
        "entity_id": "listing-nour-1501-short",
        "field": "excerpt",
        "lang": "en",
        "text": "120sqm hotel-furnished for daily/weekly rental",
        "created_at": "2024-11-20T10:00:00Z"
    }
]

# Add new data to existing structures
data['tables']['units'].extend(new_units)
data['tables']['unit_media'].extend(new_media)
data['tables']['listings'].extend(new_listings)
data['tables']['listings_lang'].extend(new_listings_lang)

# Write back to file
with open('initial.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"✅ Added {len(new_units)} units")
print(f"✅ Added {len(new_media)} media items")
print(f"✅ Added {len(new_listings)} listings")
print(f"✅ Added {len(new_listings_lang)} translations")
print(f"📊 Total listings now: {len(data['tables']['listings'])}")
