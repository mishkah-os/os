# 🏗️ Mishkah Frontend Architecture Guide
# دليل بنية Mishkah للواجهات الأمامية

**For Claude Code AI: Use this as a reference guide for building Mishkah applications**

---

## 📋 Table of Contents / جدول المحتويات

1. [نظرة عامة / Overview](#overview)
2. [هيكل المشروع / Project Structure](#project-structure)
3. [نظام المكونات / Component System](#component-system)
4. [إدارة الحالة / State Management](#state-management)
5. [نظام الألوان والثيمات / Theming System](#theming)
6. [نظام اللغات / i18n System](#i18n)
7. [التفاعل مع Backend / Backend Integration](#backend-integration)
8. [أفضل الممارسات / Best Practices](#best-practices)
9. [أمثلة عملية / Practical Examples](#examples)

---

## <a name="overview"></a>🎯 نظرة عامة / Overview

### ما هو Mishkah Frontend؟

**Mishkah** هو framework خفيف للواجهات الأمامية مبني بـ Vanilla JavaScript بدون أي مكتبات خارجية.

**Philosophy:**
- ✅ Zero Dependencies - بدون مكتبات خارجية
- ✅ Lightweight - خفيف جداً (~400 KB للمكتبة كاملة)
- ✅ Real-time First - مصمم للبيانات الفورية
- ✅ RTL Native - دعم أصلي للعربية
- ✅ Component-Based - نظام مكونات مرن

---

## <a name="project-structure"></a>📁 هيكل المشروع / Project Structure

### البنية الأساسية

```
/home/user/os/
├── static/lib/                         # مكتبات Mishkah الأساسية
│   ├── mishkah.core.js                # النواة الأساسية
│   ├── mishkah.div.js                 # مساعدات DOM
│   ├── mishkah-ui.js                  # نظام المكونات
│   ├── mishkah.store.js               # إدارة الحالة المعقدة
│   ├── mishkah.simple-store.js        # إدارة الحالة البسيطة
│   ├── mishkah.pages.js               # نظام الصفحات
│   ├── mishkah-css.css                # نظام الألوان والمكونات
│   └── mishkah-utils.js               # أدوات مساعدة
│
├── static/pos/                         # تطبيق مثالي (POS)
│   ├── pos.js                         # منطق التطبيق
│   ├── pos.html                       # صفحة HTML
│   └── pos-mini-db.js                 # اتصال قاعدة البيانات
│
├── projects/                           # مشاريعك الجديدة
│   └── your-project/
│       ├── app.html                   # صفحة HTML
│       ├── app.js                     # منطق التطبيق
│       └── README.md                  # التوثيق
│
└── data/branches/                      # البيانات
    └── your-branch/
        └── modules/
            └── your-module/
                ├── schema/definition.json
                ├── seeds/initial.json
                └── live/data.json
```

---

## <a name="component-system"></a>🧩 نظام المكونات / Component System

### 1. مكتبة mishkah.div.js - بناء العناصر

**الاستخدام الأساسي:**

```javascript
import { div, button, span, input, label } from '../../static/lib/mishkah.div.js';

// إنشاء عنصر بسيط
const myDiv = div('.', 'Hello World');

// إنشاء عنصر مع صنف CSS
const styledDiv = div('card', 'Content here');

// إنشاء عنصر مع خصائص
const interactive = button('btn/solid', {
  onclick: () => alert('Clicked!'),
  style: 'width: 100%;'
}, 'Click Me');

// إنشاء عنصر متداخل
const complex = div('card', { style: 'padding: 2rem;' }, [
  div('.', { class: 'mk-text-2xl mk-font-bold' }, 'Title'),
  div('.', { class: 'mk-text-muted' }, 'Description'),
  button('btn/solid', { onclick: handleClick }, 'Action')
]);
```

**الدوال المتاحة:**

```javascript
// العناصر الأساسية
div(classes, attrs_or_content, content_or_null)
span(classes, attrs_or_content, content_or_null)
button(classes, attrs_or_content, content_or_null)
input(classes, attrs_or_content, content_or_null)
label(classes, attrs_or_content, content_or_null)
textarea(classes, attrs_or_content, content_or_null)
select(classes, attrs_or_content, content_or_null)
option(classes, attrs_or_content, content_or_null)

// والمزيد...
```

### 2. مكتبة mishkah-ui.js - المكونات الجاهزة

**أنماط المكونات المتاحة:**

#### Layouts
```javascript
// سطح أساسي
div('surface', content)

// صفوف وأعمدة
div('hstack', { style: 'gap: 1rem;' }, [item1, item2])
div('vstack', { style: 'gap: 1rem;' }, [item1, item2])

// فاصل
div('divider')

// منطقة قابلة للتمرير
div('scrollarea', content)
```

#### Buttons
```javascript
// أنواع الأزرار
button('btn')              // زر أساسي
button('btn/solid')        // زر مملوء
button('btn/soft')         // زر ناعم
button('btn/ghost')        // زر شفاف
button('btn/destructive')  // زر خطر

// الأحجام
button('btn/sm')           // صغير
button('btn/md')           // متوسط (افتراضي)
button('btn/lg')           // كبير

// أزرار الأيقونات
button('btn/icon', { onclick: action }, '🔍')
```

#### Cards & Panels
```javascript
// بطاقة أساسية
div('card', { style: 'padding: 1.5rem;' }, [
  div('card/header', 'عنوان البطاقة'),
  div('card/content', 'محتوى البطاقة'),
  div('card/footer', 'تذييل البطاقة')
])

// بطاقة ناعمة
div('card/soft-1', content)
div('card/soft-2', content)
```

#### Badges & Chips
```javascript
// شارات
span('badge', 'نشط')
span('badge/ghost', 'معلق')

// رقاقات (chips)
div('chip', { onclick: select }, 'Option 1')
div('chip/active', 'Selected')

// حبوب (pills)
span('pill', 'Tag')
```

#### Toolbars
```javascript
div('toolbar', [
  div('toolbar/section', [
    span('.', { class: 'mk-text-xl mk-font-bold' }, 'App Name')
  ]),
  div('toolbar/section', [
    div('toolbar/group', [
      button('btn/icon', '⚙️'),
      button('btn/icon', '🔔')
    ])
  ])
])
```

#### Lists
```javascript
div('list', items.map(item =>
  div('list/item', [
    div('list/item-leading', '👤'),
    div('list/item-content', [
      div('.', { class: 'mk-font-medium' }, item.name),
      div('.', { class: 'mk-text-sm mk-text-muted' }, item.description)
    ]),
    div('list/item-trailing', item.badge)
  ])
))
```

#### Tabs
```javascript
div('tabs/row', [
  button('tabs/btn-active', { onclick: () => setTab(0) }, 'Tab 1'),
  button('tabs/btn', { onclick: () => setTab(1) }, 'Tab 2'),
  button('tabs/btn', { onclick: () => setTab(2) }, 'Tab 3')
])
```

#### Modals
```javascript
div('modal-root', { id: 'my-modal' }, [
  div('modal/md', [
    div('modal/header', 'Modal Title'),
    div('modal/content', 'Modal content here'),
    div('modal/footer', [
      button('btn/ghost', { onclick: closeModal }, 'إلغاء'),
      button('btn/solid', { onclick: saveModal }, 'حفظ')
    ])
  ])
])

// الأحجام المتاحة
// modal/sm, modal/md, modal/lg, modal/xl, modal/full
```

#### Numpad (لوحة الأرقام)
```javascript
div('numpad/root', [
  div('numpad/display', displayValue),
  div('numpad/grid', [
    ...numberButtons,
    button('numpad/confirm', 'تأكيد')
  ])
])
```

---

## <a name="state-management"></a>🔄 إدارة الحالة / State Management

### 1. Simple Store (للتطبيقات البسيطة)

```javascript
import { createSimpleStore } from '../../static/lib/mishkah.simple-store.js';

// إنشاء المتجر
const store = createSimpleStore({
  currentPage: 'dashboard',
  currentLang: 'ar',
  currentTheme: 'dark',
  selectedItem: null
});

// الاشتراك في التغييرات
store.subscribe(() => {
  const state = store.getState();
  renderApp(state);
});

// تحديث الحالة
store.setState({ currentPage: 'members' });

// قراءة الحالة
const state = store.getState();
console.log(state.currentPage);
```

### 2. Mishkah Store (للتطبيقات المعقدة)

```javascript
import { createStore } from '../../static/lib/mishkah.store.js';

// تعريف الحالة الأولية
const initialState = {
  user: null,
  cart: [],
  settings: {}
};

// تعريف الـ reducers
const reducers = {
  setUser: (state, user) => ({ ...state, user }),
  addToCart: (state, item) => ({
    ...state,
    cart: [...state.cart, item]
  }),
  removeFromCart: (state, itemId) => ({
    ...state,
    cart: state.cart.filter(i => i.id !== itemId)
  })
};

// إنشاء المتجر
const store = createStore(initialState, reducers);

// استخدام الـ actions
store.dispatch('setUser', { id: 1, name: 'أحمد' });
store.dispatch('addToCart', { id: 1, name: 'منتج' });

// الاشتراك في التغييرات
store.subscribe((state) => {
  console.log('State updated:', state);
  render();
});
```

---

## <a name="theming"></a>🎨 نظام الألوان والثيمات / Theming System

### المتغيرات الأساسية

**ملف mishkah-css.css يحتوي على:**

```css
:root {
  /* الخلفيات / Backgrounds */
  --mk-bg: #0b0f13;              /* الخلفية الرئيسية */
  --mk-surface-0: #12171d;       /* سطح المستوى 0 */
  --mk-surface-1: #1a2129;       /* سطح المستوى 1 */
  --mk-surface-2: #202934;       /* سطح المستوى 2 */
  --mk-surface-3: #28323f;       /* سطح المستوى 3 */

  /* النصوص / Text */
  --mk-fg: #e8eef4;              /* نص أساسي */
  --mk-muted: #aab6c3;           /* نص ثانوي */

  /* الألوان الدلالية / Semantic Colors */
  --mk-primary: #2aa5a0;         /* اللون الأساسي */
  --mk-secondary: #ca8a04;       /* اللون الثانوي */
  --mk-accent: #8b5cf6;          /* لون التمييز */
  --mk-success: #10b981;         /* نجاح */
  --mk-warning: #f59e0b;         /* تحذير */
  --mk-danger: #ef4444;          /* خطر */

  /* الحدود / Borders */
  --mk-border: #2a3340;          /* لون الحدود */
}

/* Light Theme */
:root[data-theme="light"] {
  --mk-bg: #f8fafb;
  --mk-surface-0: #ffffff;
  --mk-surface-1: #f1f5f9;
  --mk-fg: #16212e;
  --mk-muted: #64748b;
  --mk-border: #c8d1dc;
}
```

### تطبيق الثيمات

```javascript
// تغيير الثيم
document.documentElement.setAttribute('data-theme', 'dark'); // or 'light'

// في التطبيق
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  store.setState({ currentTheme: newTheme });
}
```

### Utility Classes

```javascript
// أحجام النصوص
'mk-text-sm'      // 0.875rem
'mk-text-base'    // 1rem
'mk-text-lg'      // 1.125rem
'mk-text-xl'      // 1.25rem
'mk-text-2xl'     // 1.5rem
'mk-text-3xl'     // 1.875rem
'mk-text-4xl'     // 2.25rem

// أوزان الخطوط
'mk-font-normal'  // 400
'mk-font-medium'  // 500
'mk-font-bold'    // 700

// ألوان النصوص
'mk-text-muted'   // نص باهت
'mk-text-primary' // نص بلون أساسي
```

---

## <a name="i18n"></a>🌐 نظام اللغات / i18n System

### البنية الموصى بها

```javascript
// تعريف الترجمات
const translations = {
  dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
  members: { ar: 'الأعضاء', en: 'Members' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  save: { ar: 'حفظ', en: 'Save' },
  cancel: { ar: 'إلغاء', en: 'Cancel' }
};

// دالة الترجمة
function t(key) {
  return translations[key] ? translations[key][currentLang] : key;
}

// دعم JSON متعدد اللغات (في البيانات)
{
  "name": {
    "en": "Ahmed Hassan",
    "ar": "أحمد حسن"
  },
  "description": {
    "en": "Manager",
    "ar": "مدير"
  }
}
```

### تطبيق RTL/LTR

```javascript
// تطبيق اللغة والاتجاه
function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  store.setState({ currentLang: lang });
  renderApp();
}

// في HTML
<html lang="ar" dir="rtl" data-theme="dark">
```

### خطوط متعددة اللغات

```css
body {
  font-family: 'Cairo', 'Inter', system-ui, -apple-system, sans-serif;
}

/* للعربية */
[lang="ar"] {
  font-family: 'Cairo', 'Noto Naskh Arabic', 'Amiri', sans-serif;
}

/* للإنجليزية */
[lang="en"] {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
```

---

## <a name="backend-integration"></a>🔌 التفاعل مع Backend / Backend Integration

### 1. إنشاء قاعدة البيانات

```javascript
// في ملف app.js
import { createPosDb } from '../../static/pos/pos-mini-db.js';

const BRANCH_ID = 'your-branch';
const MODULE_ID = 'your-module';

async function init() {
  // إنشاء قاعدة البيانات
  const result = await createPosDb({
    branchId: BRANCH_ID,
    moduleId: MODULE_ID
  });

  const db = result.db;
  await db.ready();

  // الآن يمكنك استخدام قاعدة البيانات
  const members = db.list('gym_member');
  console.log('Members:', members);
}
```

### 2. قراءة البيانات

```javascript
// قراءة جميع الصفوف من جدول
const allMembers = db.list('gym_member');

// قراءة صف واحد بالـ ID
const member = db.get('gym_member', 'member_001');

// فلترة البيانات
const activeMembers = db.list('gym_member').filter(m => m.status === 'active');

// البحث
const searchResults = db.list('gym_member').filter(m =>
  m.full_name.ar.includes(searchTerm) ||
  m.full_name.en.includes(searchTerm)
);
```

### 3. كتابة البيانات

```javascript
// إضافة صف جديد
db.insert('gym_member', {
  id: 'member_013',
  member_code: 'GYM013',
  full_name: {
    ar: 'محمد علي',
    en: 'Mohamed Ali'
  },
  email: 'mohamed@email.com',
  phone: '+20 10 1234 5678',
  status: 'active',
  created_at: new Date().toISOString()
});

// تحديث صف
db.update('gym_member', 'member_001', {
  status: 'inactive',
  updated_at: new Date().toISOString()
});

// حذف صف
db.delete('gym_member', 'member_001');
```

### 4. المزامنة الفورية (Real-time)

```javascript
// الاشتراك في تحديثات جدول معين
db.subscribe('gym_member', (members) => {
  console.log('Members updated:', members);
  renderMembersList(members);
});

// الاشتراك في جميع التحديثات
db.onUpdate(() => {
  console.log('Database updated');
  renderApp();
});
```

---

## <a name="best-practices"></a>✅ أفضل الممارسات / Best Practices

### 1. تنظيم الكود

```javascript
// ✅ جيد: فصل المنطق عن العرض

// app.js
// === STATE & DATA ===
let db;
let store;
let currentLang = 'ar';

// === INITIALIZATION ===
async function init() {
  db = await setupDatabase();
  store = createSimpleStore(initialState);
  store.subscribe(renderApp);
  renderApp();
}

// === RENDER FUNCTIONS ===
function renderApp() {
  const state = store.getState();
  const app = div('.', { class: 'mk-app' }, [
    renderTopBar(),
    renderMainContent(state)
  ]);
  document.getElementById('app').replaceChildren(app);
}

function renderTopBar() {
  return div('toolbar', [
    // ...
  ]);
}

// === EVENT HANDLERS ===
function handleMemberClick(member) {
  store.setState({ selectedMember: member });
}

// === HELPERS ===
function formatDate(dateStr) {
  // ...
}

// === START ===
init();
```

### 2. إدارة الحالة

```javascript
// ✅ جيد: حالة مركزية
const store = createSimpleStore({
  currentPage: 'dashboard',
  currentLang: 'ar',
  selectedItem: null,
  searchTerm: '',
  filters: {}
});

// ❌ سيء: حالة متناثرة
let currentPage = 'dashboard';
let lang = 'ar';
let selected = null;
```

### 3. بناء المكونات

```javascript
// ✅ جيد: مكونات قابلة لإعادة الاستخدام
function renderStatCard(icon, label, value, variant = 'primary') {
  return div('card', { style: 'padding: 1.5rem;' }, [
    div('hstack', { style: 'justify-content: space-between;' }, [
      div('vstack', { style: 'gap: 0.5rem;' }, [
        span('.', { class: 'mk-text-muted' }, label),
        span('.', { class: 'mk-text-2xl mk-font-bold' }, value)
      ]),
      span('.', { class: 'mk-text-4xl' }, icon)
    ])
  ]);
}

// الاستخدام
renderStatCard('👥', t('total_members'), members.length, 'primary');
renderStatCard('💰', t('revenue'), formatCurrency(revenue), 'success');
```

### 4. التعامل مع الأحداث

```javascript
// ✅ جيد: معالجات أحداث واضحة
function setupEventHandlers() {
  document.addEventListener('keydown', handleKeyPress);
  window.addEventListener('resize', handleResize);
}

function handleKeyPress(e) {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.ctrlKey) saveForm();
}

// التنظيف عند الحاجة
function cleanup() {
  document.removeEventListener('keydown', handleKeyPress);
}
```

### 5. معالجة الأخطاء

```javascript
// ✅ جيد: معالجة الأخطاء
async function loadData() {
  try {
    const result = await createPosDb({ branchId, moduleId });
    db = result.db;
    await db.ready();
    renderApp();
  } catch (error) {
    console.error('Failed to load data:', error);
    showErrorMessage(t('error_loading_data'));
  }
}
```

### 6. الأداء

```javascript
// ✅ جيد: استخدام debounce للبحث
let searchTimeout;
function handleSearchInput(value) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(value);
  }, 300);
}

// ✅ جيد: تحديث جزئي
function updateMemberCard(memberId) {
  const card = document.querySelector(`[data-member-id="${memberId}"]`);
  if (card) {
    card.replaceWith(renderMemberCard(db.get('gym_member', memberId)));
  }
}

// ❌ سيء: إعادة رسم كل شيء
function updateMemberCard(memberId) {
  renderApp(); // يعيد رسم التطبيق كله!
}
```

---

## <a name="examples"></a>💡 أمثلة عملية / Practical Examples

### مثال 1: صفحة Dashboard كاملة

```javascript
function renderDashboard() {
  const members = db.list('gym_member') || [];
  const subscriptions = db.list('membership_subscription') || [];
  const reports = db.list('revenue_report') || [];

  const activeCount = subscriptions.filter(s => s.status === 'active').length;
  const expiringCount = subscriptions.filter(s => s.status === 'expiring_soon').length;
  const monthlyReport = reports.find(r => r.report_type === 'monthly');
  const revenue = monthlyReport ? monthlyReport.total_revenue : 0;

  return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
    // Header
    div('.', { class: 'mk-text-3xl mk-font-bold' }, t('dashboard')),

    // Stats Grid
    div('.', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;'
    }, [
      renderStatCard('👥', t('total_members'), members.length, 'primary'),
      renderStatCard('✅', t('active_subscriptions'), activeCount, 'success'),
      renderStatCard('⚠️', t('expiring_soon'), expiringCount, 'warning'),
      renderStatCard('💰', t('monthly_revenue'), formatCurrency(revenue), 'accent')
    ]),

    // Content Grid
    div('.', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem;'
    }, [
      renderRecentActivity(),
      renderRenewalReminders()
    ])
  ]);
}
```

### مثال 2: نموذج تفاعلي (Form)

```javascript
function renderMemberForm(member = null) {
  const isEdit = !!member;

  return div('card', { style: 'padding: 2rem; max-width: 600px; margin: 0 auto;' }, [
    div('.', { class: 'mk-text-2xl mk-font-bold', style: 'margin-bottom: 2rem;' },
      isEdit ? t('edit_member') : t('add_member')
    ),

    div('vstack', { style: 'gap: 1.5rem;' }, [
      // الاسم بالعربية
      div('vstack', { style: 'gap: 0.5rem;' }, [
        label('.', t('name_ar')),
        input('input', {
          type: 'text',
          id: 'name-ar',
          value: member?.full_name.ar || '',
          placeholder: t('enter_name_ar')
        })
      ]),

      // الاسم بالإنجليزية
      div('vstack', { style: 'gap: 0.5rem;' }, [
        label('.', t('name_en')),
        input('input', {
          type: 'text',
          id: 'name-en',
          value: member?.full_name.en || '',
          placeholder: t('enter_name_en')
        })
      ]),

      // الهاتف
      div('vstack', { style: 'gap: 0.5rem;' }, [
        label('.', t('phone')),
        input('input', {
          type: 'tel',
          id: 'phone',
          value: member?.phone || '',
          placeholder: '+20 10 XXXX XXXX'
        })
      ]),

      // البريد الإلكتروني
      div('vstack', { style: 'gap: 0.5rem;' }, [
        label('.', t('email')),
        input('input', {
          type: 'email',
          id: 'email',
          value: member?.email || '',
          placeholder: 'example@email.com'
        })
      ]),

      // الأزرار
      div('hstack', { style: 'gap: 1rem; justify-content: flex-end; margin-top: 1rem;' }, [
        button('btn/ghost', {
          onclick: () => store.setState({ currentPage: 'members' })
        }, t('cancel')),
        button('btn/solid', {
          onclick: () => saveMember(member?.id)
        }, t('save'))
      ])
    ])
  ]);
}

function saveMember(id) {
  const nameAr = document.getElementById('name-ar').value;
  const nameEn = document.getElementById('name-en').value;
  const phone = document.getElementById('phone').value;
  const email = document.getElementById('email').value;

  if (!nameAr || !nameEn || !phone || !email) {
    alert(t('please_fill_all_fields'));
    return;
  }

  const memberData = {
    full_name: { ar: nameAr, en: nameEn },
    phone,
    email,
    updated_at: new Date().toISOString()
  };

  if (id) {
    // تحديث
    db.update('gym_member', id, memberData);
  } else {
    // إضافة جديد
    db.insert('gym_member', {
      id: `member_${Date.now()}`,
      member_code: `GYM${Math.floor(Math.random() * 10000)}`,
      ...memberData,
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  store.setState({ currentPage: 'members' });
}
```

### مثال 3: جدول تفاعلي

```javascript
function renderTable(data, columns, onRowClick) {
  const table = document.createElement('table');
  table.className = 'mk-table';
  table.style.width = '100%';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = t(col.key);
    th.style.padding = '1rem';
    th.style.textAlign = currentLang === 'ar' ? 'right' : 'left';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => onRowClick(row);

    columns.forEach(col => {
      const td = document.createElement('td');
      td.style.padding = '1rem';

      const value = col.render
        ? col.render(row[col.field], row)
        : row[col.field];

      if (typeof value === 'string') {
        td.textContent = value;
      } else {
        td.appendChild(value);
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

// الاستخدام
const columns = [
  { key: 'member_code', field: 'member_code' },
  {
    key: 'full_name',
    field: 'full_name',
    render: (val) => val[currentLang]
  },
  { key: 'phone', field: 'phone' },
  {
    key: 'status',
    field: 'status',
    render: (val) => span('badge', t(val))
  }
];

const membersTable = renderTable(
  members,
  columns,
  (member) => viewMember(member)
);
```

---

## 🎓 نصائح للنجاح / Tips for Success

### 1. ابدأ بسيطاً
- لا تحاول بناء كل شيء دفعة واحدة
- ابدأ بـ Dashboard بسيط
- أضف الميزات تدريجياً

### 2. استخدم الأمثلة
- راجع تطبيق POS الموجود
- راجع مشروع الجيم
- انسخ الأنماط الموجودة

### 3. اختبر باستمرار
- افتح المتصفح أثناء التطوير
- راجع الـ Console للأخطاء
- اختبر على أحجام شاشة مختلفة

### 4. استخدم الأدوات المساعدة
- `console.log` للتصحيح
- DevTools للفحص
- Lighthouse للأداء

### 5. وثّق كودك
- أضف تعليقات للأجزاء المعقدة
- اكتب README لكل مشروع
- وثق القرارات المعمارية

---

## 📚 مراجع إضافية / Additional Resources

### الملفات المهمة للمراجعة
1. `/static/pos/pos.js` - تطبيق POS الكامل (10,000+ سطر)
2. `/projects/gim/gym.js` - نظام الجيم (مثال جيد)
3. `/static/lib/mishkah-css.css` - نظام الألوان الكامل
4. `/static/lib/mishkah.div.js` - مساعدات DOM

### الأنماط المتاحة في mishkah-ui.js
راجع الملف مباشرة لرؤية جميع الأنماط المتاحة:
```javascript
const classes = {
  'surface': '...',
  'card': '...',
  'btn': '...',
  // ... المزيد
};
```

---

## ✅ Checklist للمشروع الجديد

عند بدء مشروع جديد:

- [ ] أنشئ هيكل المجلدات في `projects/`
- [ ] أنشئ هيكل البيانات في `data/branches/`
- [ ] حدث `branches.config.json`
- [ ] حدث `modules.json`
- [ ] أنشئ schema definition
- [ ] أنشئ mock data
- [ ] أنشئ ملف HTML
- [ ] أنشئ ملف JS
- [ ] اختبر الاتصال بقاعدة البيانات
- [ ] ابنِ Dashboard أساسي
- [ ] أضف دعم اللغات
- [ ] أضف دعم الثيمات
- [ ] اختبر على الأجهزة المختلفة
- [ ] اكتب README
- [ ] عمل commit و push

---

**هذا الدليل سيساعدك في بناء أي تطبيق Mishkah بسهولة!** 🚀
