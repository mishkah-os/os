# KDS Screen Rebuild Notes

## Overview
شاشة KDS تم إعادة بنائها من الصفر بهدف تبسيط المنطق وحل مشكلة ظهور IDs بدلاً من أسماء الأصناف.

## Changes Made

### 1. تبسيط معالجة البيانات
- **قبل**: كود معقد جداً مع العديد من التحويلات والـ mapping
- **بعد**: كود مبسط يعتمد مباشرة على البيانات من WebSocket

### 2. إلغاء localStorage
- **قبل**: استخدام localStorage لحفظ حالة handoff
- **بعد**: الاعتماد كلياً على WebSocket watch بدون تخزين محلي

### 3. هيكل البيانات الجديد
الملف الجديد يعتمد على:
- `job_order_header` - رأس كل طلب لكل قسم مطبخ
- `job_order_detail` - تفاصيل الأصناف في كل طلب
- `kitchen_sections` - أقسام المطبخ
- `menu_items` - بيانات الأصناف الكاملة (أسماء، أوصاف، إلخ)
- `menu_categories` - تصنيفات الأصناف

### 4. حل مشكلة IDs
المشكلة السابقة كانت أن الأصناف تظهر كـ IDs فقط. الحل:
- إنشاء `menuItemMap` للوصول السريع لبيانات الصنف
- استخراج `item_name` من `menu_items` مباشرة
- دعم النصوص متعددة اللغات (عربي/إنجليزي)

### 5. تدفق البيانات المبسط

```
WebSocket Watch
    ↓
job_order_header + job_order_detail
    ↓
processData() - معالجة بسيطة
    ↓
state.jobOrders - قائمة مسطحة جاهزة للعرض
    ↓
render() - عرض UI
```

## State Structure

```javascript
const state = {
  lang: 'ar',              // اللغة الحالية
  theme: 'dark',           // المظهر
  activeTab: 'prep',       // التبويب النشط
  activeSection: null,     // القسم المحدد (null = الكل)

  // البيانات من WebSocket
  jobOrderHeaders: [],
  jobOrderDetails: [],
  kitchenSections: [],
  menuItems: [],

  // البيانات المعالجة
  jobOrders: [],          // قائمة مبسطة للعرض

  isOnline: false
}
```

## UI Features

### 1. Header
- عنوان الشاشة
- حالة الاتصال (متصل/غير متصل)
- زر تغيير اللغة

### 2. Tabs
- كل الأقسام (Prep)
- شاشة التجميع (Expo)

### 3. Section Filters
- عرض كل الأقسام أو قسم محدد
- تبويبات لكل قسم مطبخ

### 4. Job Cards
- رقم الطلب
- الطاولة والعميل
- القسم المطبخي
- قائمة الأصناف مع:
  - الاسم الكامل (بدلاً من ID)
  - الكمية
  - الحالة
  - الملاحظات
- أزرار الإجراءات

## Files

- `/static/pos/kds.js` - الملف الجديد المبسط
- `/static/pos/kds.js.backup` - نسخة احتياطية من الملف القديم
- `/static/pos/kds-new.js` - الملف المؤقت (يمكن حذفه بعد التأكد)
- `/static/pos/kds.html` - ملف HTML (لم يتغير)

## Testing

للاختبار:
1. افتح الشاشة: `/static/pos/kds.html?brname=dar`
2. تأكد من ظهور أسماء الأصناف (وليس IDs)
3. تأكد من عمل الفلترة حسب القسم
4. تأكد من تحديث البيانات تلقائياً عبر WebSocket

## Migration Notes

إذا كنت تريد العودة للنسخة القديمة:
```bash
cp /home/user/os/static/pos/kds.js.backup /home/user/os/static/pos/kds.js
```

## Next Steps

- [ ] إضافة دعم لتحديث حالة الطلبات
- [ ] إضافة دعم للإشعارات الصوتية
- [ ] تحسين UI للشاشات الكبيرة
- [ ] إضافة إحصائيات وقت التحضير
