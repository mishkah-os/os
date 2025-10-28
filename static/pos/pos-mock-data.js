/**
 * بسم الله الرحمن الرحيم
 * FILE: pos-mock-data.js
 *
 * هذا الملف يمثل قاعدة بيانات محاكاة (mock) للتطبيق. في مرحلة التطوير،
 * يعمل هذا الملف كمصدر الحقيقة الثابت للبيانات (مثل قائمة الأصناف، الموظفين، إلخ).
 * في التطبيق الحقيقي، سيتم استبدال هذا الملف باستدعاءات AJAX لجلب البيانات
 * من خادم حقيقي أو عبر WebSockets.
 */

const database = {
  // --- الإعدادات العامة للنظام ---
  settings: {
    tax_rate: 0.14,
    service_charge_rate: 0.12,
    default_delivery_fee: 30.0,
    currency: {
      code: 'EGP',
      display: 'symbol',
      name: {
        en: 'Egyptian Pound',
        ar: 'الجنيه المصري'
      },
      symbols: {
        en: 'E£',
        ar: 'ج.م'
      }
    },
    sync: {
      branch_id: 'branch-main',
      branch_name: {
        ar: 'الفرع الرئيسي',
        en: 'Main branch'
      },
      channel: 'branch-main',
      ws_endpoint: 'wss://ws.mas.com.eg/ws'
    }
  },

  // --- إعدادات الوردية ووسائل الدفع ---
  shift_settings: {
    opening_float: 500,
    pin: '2580',
    pin_length: 4
  },

  payment_methods: [
    { id: 'cash', icon: '💵', name: { ar: 'نقدي', en: 'Cash' }, type: 'cash' },
    { id: 'visa', icon: '💳', name: { ar: 'فيزا', en: 'Visa' }, type: 'card' },
    { id: 'mastercard', icon: '💳', name: { ar: 'ماستر كارد', en: 'Mastercard' }, type: 'card' },
    { id: 'insta', icon: '📱', name: { ar: 'InstaPay', en: 'InstaPay' }, type: 'wallet' }
  ],

  shifts: [
    // يوضح المثال التالي شكل كائن الوردية عند الاعتماد على مخطط SHIFT_TABLE في mishkah-schema.js
    // احتفظ به كمرجع فقط ولا تضف بيانات فعلية أثناء الاختبار.
    // {
    //   id: 'P001-SABC123',
    //   pos_id: 'P001',
    //   pos_label: 'POS 1',
    //   pos_number: 1,
    //   opened_at: '2024-02-17T08:00:00Z',
    //   closed_at: null,
    //   opening_float: 500,
    //   closing_cash: null,
    //   cashier_id: 'cashier-01',
    //   cashier_name: 'أحمد محمود',
    //   cashier_role: 'cashier',
    //   employee_id: 'cashier-01',
    //   status: 'open',
    //   is_closed: false,
    //   totals_by_type: { dine_in: 0, takeaway: 0, delivery: 0 },
    //   payments_by_method: { cash: 0, visa: 0 },
    //   counts_by_type: { dine_in: 0, takeaway: 0, delivery: 0 },
    //   orders_count: 0,
    //   orders_payload: [],
    //   total_sales: 0
    // }
  ],

  // --- تعريف الأقسام الرئيسية للمطبخ ---
  kitchen_sections: [
    {
      id: 'hot_line',
      section_name: { en: 'Hot Line', ar: 'شاشة السخن' },
      description: {
        en: 'Soups, stews, sandwiches and cooked meals.',
        ar: 'الشوربات واليخنات والسندويتشات والأطباق المطهية.'
      }
    },
    {
      id: 'grill_line',
      section_name: { en: 'Grill Station', ar: 'شاشة المشاوي' },
      description: {
        en: 'All grilled meats prepared by the butchery team.',
        ar: 'كل اللحوم المشوية التي يجهزها فريق المشويات.'
      }
    },
    {
      id: 'mandi_line',
      section_name: { en: 'Mandi & Kabsa', ar: 'شاشة المندي' },
      description: {
        en: 'Traditional mandi, kabsa and rice based trays.',
        ar: 'أطباق المندي والكبسة والأرز في الصواني.'
      }
    },
    {
      id: 'buffet_bar',
      section_name: { en: 'Buffet & Drinks', ar: 'شاشة البوفيه' },
      description: {
        en: 'Desserts, beverages and cold items.',
        ar: 'الحلويات والمشروبات والأصناف الباردة.'
      }
    },
    {
      id: 'expo',
      section_name: { en: 'Expeditor', ar: 'شاشة التجميع' },
      description: {
        en: 'Final assembly and hand-off to runners.',
        ar: 'التجميع النهائي وتسليم الطلبات للمندوبين.'
      }
    }
  ],

  // --- ربط التصنيفات مع الأقسام ---
  category_sections: [
    { category_id: 'appetizers', section_id: 'buffet_bar' },
    { category_id: 'sandwiches', section_id: 'hot_line' },
    { category_id: 'hawawshi', section_id: 'hot_line' },
    { category_id: 'combo_meals', section_id: 'hot_line' },
    { category_id: 'kilo_grills', section_id: 'grill_line' },
    { category_id: 'side_items', section_id: 'buffet_bar' },
    { category_id: 'desserts', section_id: 'buffet_bar' },
    { category_id: 'beverages', section_id: 'buffet_bar' }
  ],

  // --- أنواع الطلبات ---
  order_types: [
    {
      id: 'dine_in',
      type_name: { en: 'Dine-in', ar: 'صالة' },
      description: {
        en: 'Table service orders managed inside the restaurant.',
        ar: 'طلبات الصالة التي تُدار داخل المطعم.'
      },
      workflow: 'multi-step',
      allows_save: true,
      allows_finalize_later: true,
      allows_line_additions: true,
      allows_returns: true
    },
    {
      id: 'delivery',
      type_name: { en: 'Delivery', ar: 'دليفري' },
      description: {
        en: 'Orders delivered to customers with a single-step closure.',
        ar: 'طلبات التوصيل التي تُغلق في خطوة واحدة.'
      },
      workflow: 'single-step',
      allows_save: false,
      allows_finalize_later: false,
      allows_line_additions: false,
      allows_returns: false
    },
    {
      id: 'takeaway',
      type_name: { en: 'Takeaway', ar: 'تيك أواي' },
      description: {
        en: 'Counter pickup orders paid on capture.',
        ar: 'طلبات التيك أواي تُدفع وتُغلق في نفس الخطوة.'
      },
      workflow: 'single-step',
      allows_save: false,
      allows_finalize_later: false,
      allows_line_additions: false,
      allows_returns: false
    }
  ],

  // --- حالات الطلب الرئيسية ---
  order_statuses: [
    { id: 'open', status_name: { en: 'Open', ar: 'مفتوح' } },
    { id: 'held', status_name: { en: 'On Hold', ar: 'معلّق' } },
    { id: 'finalized', status_name: { en: 'Finalized', ar: 'منتهي' } },
    { id: 'closed', status_name: { en: 'Closed', ar: 'مغلق' } }
  ],

  // --- حالات الدفع ---
  order_payment_states: [
    { id: 'unpaid', payment_name: { en: 'Unpaid', ar: 'غير مدفوع' } },
    { id: 'partial', payment_name: { en: 'Partially Paid', ar: 'مدفوع جزئيًا' } },
    { id: 'paid', payment_name: { en: 'Paid', ar: 'مدفوع' } }
  ],

  // --- مراحل دورة حياة الطلب ---
  order_stages: [
    {
      id: 'new',
      stage_name: { en: 'New', ar: 'جديد' },
      description: {
        en: 'Order is created and waiting to be sent to the kitchen.',
        ar: 'تم إنشاء الطلب وينتظر الإرسال إلى المطبخ.'
      },
      sequence: 1,
      lock_line_edits: false
    },
    {
      id: 'preparing',
      stage_name: { en: 'Preparing', ar: 'جاري التجهيز' },
      description: {
        en: 'Kitchen started preparing the order items.',
        ar: 'المطبخ بدأ في تجهيز أصناف الطلب.'
      },
      sequence: 2,
      lock_line_edits: true
    },
    {
      id: 'prepared',
      stage_name: { en: 'Prepared', ar: 'تم التجهيز' },
      description: {
        en: 'Items are ready and waiting for dispatch.',
        ar: 'الأصناف جاهزة وتنتظر التسليم.'
      },
      sequence: 3,
      lock_line_edits: true
    },
    {
      id: 'delivering',
      stage_name: { en: 'Delivering', ar: 'جاري التسليم' },
      description: {
        en: 'Order is on the way to the guest.',
        ar: 'الطلب في الطريق إلى العميل.'
      },
      sequence: 4,
      lock_line_edits: true
    },
    {
      id: 'delivered',
      stage_name: { en: 'Delivered', ar: 'تم التسليم' },
      description: {
        en: 'Order was delivered or served.',
        ar: 'تم تسليم الطلب أو تقديمه.'
      },
      sequence: 5,
      lock_line_edits: true
    },
    {
      id: 'paid',
      stage_name: { en: 'Paid', ar: 'تم الدفع' },
      description: {
        en: 'Payment has been captured for the order.',
        ar: 'تم تحصيل قيمة الطلب.'
      },
      sequence: 6,
      lock_line_edits: true
    },
    {
      id: 'closed',
      stage_name: { en: 'Closed', ar: 'تم الإغلاق' },
      description: {
        en: 'Order was audited and closed after shift end.',
        ar: 'تمت مراجعة الطلب وإغلاقه بعد نهاية الوردية.'
      },
      sequence: 7,
      lock_line_edits: true
    }
  ],

  // --- حالات أسطر الطلب ---
  order_line_statuses: [
    { id: 'draft', status_name: { en: 'Draft', ar: 'مسودة' } },
    { id: 'queued', status_name: { en: 'Queued', ar: 'بانتظار التحضير' } },
    { id: 'preparing', status_name: { en: 'Preparing', ar: 'جاري التحضير' } },
    { id: 'ready', status_name: { en: 'Ready', ar: 'جاهز' } },
    { id: 'served', status_name: { en: 'Served', ar: 'مُقدّم' } }
  ],

  // --- بيانات الموظفين والصلاحيات ---
  employees: [
    { id: 'e7a8f0b4', pin_code: '1122', full_name: 'أحمد محمود', role: 'cashier', allowed_discount_rate: 0.1 },
    { id: 'f3c9d8e1', pin_code: '3344', full_name: 'سارة علي', role: 'cashier', allowed_discount_rate: 0.1 },
    { id: 'a1b2c3d4', pin_code: '9999', full_name: 'خالد إبراهيم', role: 'manager', allowed_discount_rate: 0.25 },
    { id: 'b5c6d7e8', pin_code: '5566', full_name: 'فاطمة حسن', role: 'kitchen_staff', allowed_discount_rate: 0.0 },
    { id: 'c9d0e1f2', pin_code: '7788', full_name: 'يوسف كريم', role: 'delivery_driver', allowed_discount_rate: 0.0 }
  ],

  // --- بيانات الطاولات في المطعم ---
  tables: [
    { id: 'T1', name: 'طاولة 1', seats: 4, state: 'active', zone: 'A', displayOrder: 1 },
    { id: 'T2', name: 'طاولة 2', seats: 4, state: 'active', zone: 'A', displayOrder: 2 },
    { id: 'T3', name: 'طاولة 3', seats: 2, state: 'active', zone: 'A', displayOrder: 3 },
    { id: 'T4', name: 'طاولة 4', seats: 6, state: 'maintenance', zone: 'B', displayOrder: 4, note: 'تنظيف عميق' },
    { id: 'T5', name: 'طاولة 5', seats: 2, state: 'active', zone: 'B', displayOrder: 5 },
    { id: 'T6', name: 'طاولة 6', seats: 8, state: 'active', zone: 'VIP', displayOrder: 6 },
    { id: 'T7', name: 'طاولة 7', seats: 4, state: 'active', zone: 'A', displayOrder: 7 },
    { id: 'T8', name: 'طاولة 8', seats: 4, state: 'active', zone: 'A', displayOrder: 8 },
    { id: 'T9', name: 'طاولة 9', seats: 6, state: 'active', zone: 'Terrace', displayOrder: 9 },
    { id: 'T10', name: 'طاولة 10', seats: 6, state: 'active', zone: 'Terrace', displayOrder: 10 },
    { id: 'T11', name: 'طاولة 11', seats: 2, state: 'active', zone: 'A', displayOrder: 11 },
    { id: 'T12', name: 'طاولة 12', seats: 4, state: 'active', zone: 'A', displayOrder: 12 },
    { id: 'T13', name: 'طاولة 13', seats: 8, state: 'active', zone: 'VIP', displayOrder: 13 },
    { id: 'T14', name: 'طاولة 14', seats: 4, state: 'maintenance', zone: 'B', displayOrder: 14 },
    { id: 'T15', name: 'طاولة 15', seats: 2, state: 'active', zone: 'B', displayOrder: 15 },
    { id: 'T16', name: 'طاولة 16', seats: 10, state: 'active', zone: 'Banquet', displayOrder: 16 },
    { id: 'T17', name: 'طاولة 17', seats: 4, state: 'active', zone: 'A', displayOrder: 17 },
    { id: 'T18', name: 'طاولة 18', seats: 4, state: 'active', zone: 'A', displayOrder: 18 },
    { id: 'T19', name: 'طاولة 19', seats: 6, state: 'disactive', zone: 'Storage', displayOrder: 19, note: 'خارج الخدمة' },
    { id: 'T20', name: 'طاولة 20', seats: 6, state: 'active', zone: 'Terrace', displayOrder: 20 }
  ],

  tableLocks: [],

  // --- الطلبات الأولية ---
  // اترك هذه القائمة فارغة، فكل الطلبات يجب أن تُنشأ عبر الطبقات الجديدة (ORM الصغيرة) حتى تُربط بالوردية الصحيحة.
  orders: [],



  reservations: [
    { id: 'res-001', customerName: 'محمد سامي', phone: '01000200300', partySize: 4, scheduledAt: '2024-02-18T19:00:00Z', holdUntil: '2024-02-18T19:20:00Z', tableIds: ['T7'], status: 'booked', note: 'عيد ميلاد' },
    { id: 'res-002', customerName: 'Sarah Ahmed', phone: '01133344455', partySize: 2, scheduledAt: '2024-02-18T20:30:00Z', holdUntil: '2024-02-18T20:50:00Z', tableIds: ['T5', 'T6'], status: 'booked', note: 'جلسة هادئة' },
    { id: 'res-003', customerName: 'شركة بريميوم', phone: '01266677788', partySize: 10, scheduledAt: '2024-02-19T13:00:00Z', holdUntil: '2024-02-19T13:15:00Z', tableIds: ['T16'], status: 'seated', note: 'اجتماع عمل' }
  ],

  auditEvents: [
    { id: 'audit-001', userId: 'a1b2c3d4', action: 'table.state', refType: 'table', refId: 'T19', at: '2024-02-15T10:00:00Z', meta: { state: 'disactive' } }
  ],

  // --- بيانات سائقي التوصيل ---
  drivers: [
    { id: 1, name: 'محمود عبد العزيز', phone: '01012345678', vehicle_id: 'موتوسيكل - أ ب ج 123' },
    { id: 2, name: 'كريم السيد', phone: '01198765432', vehicle_id: 'موتوسيكل - س ص ع 456' },
    { id: 3, name: 'علي حسن', phone: '01234567890', vehicle_id: 'سيارة - ف ق ل 789' }
  ],

  // --- تصنيفات قائمة الطعام ---
  categories: [
    { id: 'all', category_name: { en: 'All', ar: 'الكل' }, section_id: 'expo' },
    { id: 'appetizers', category_name: { en: 'Appetizers', ar: 'المقبلات' }, section_id: 'buffet_bar' },
    { id: 'sandwiches', category_name: { en: 'Sandwiches', ar: 'السندويتشات' }, section_id: 'hot_line' },
    { id: 'hawawshi', category_name: { en: 'Hawawshi', ar: 'الحواوشي' }, section_id: 'hot_line' },
    { id: 'combo_meals', category_name: { en: 'Combo Meals', ar: 'وجبات الكومبو' }, section_id: 'hot_line' },
    { id: 'kilo_grills', category_name: { en: 'Grills by Kilo', ar: 'مشويات بالكيلو' }, section_id: 'grill_line' },
    { id: 'side_items', category_name: { en: 'Side Items', ar: 'الأصناف الجانبية' }, section_id: 'buffet_bar' },
    { id: 'desserts', category_name: { en: 'Desserts', ar: 'الحلويات' }, section_id: 'buffet_bar' },
    { id: 'beverages', category_name: { en: 'Beverages', ar: 'المشروبات' }, section_id: 'buffet_bar' }
  ],

  // --- قائمة الطعام الرئيسية ---
  items: [
    {
      id: 1,
      category_id: 'appetizers',
      kitchen_section_id: 'buffet_bar',
      pricing: { base: 53.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/blob_637388278140512938'
      },
      item_name: {
        en: 'Green Salad',
        ar: 'سلطة خضراء'
      },
      item_description: {
        en: 'A refreshing mix of lettuce, tomatoes, and cucumbers.',
        ar: 'مزيج منعش من الخس والطماطم والخيار.'
      }
    },
    {
      id: 2,
      category_id: 'appetizers',
      kitchen_section_id: 'buffet_bar',
      pricing: { base: 49.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/blob_637388277511975892'
      },
      item_name: {
        en: 'Tahini Salad',
        ar: 'سلطة طحينة'
      },
      item_description: {
        en: 'Creamy tahini with lemon and garlic.',
        ar: 'طحينة كريمية بالليمون والثوم.'
      }
    },
    {
      id: 3,
      category_id: 'appetizers',
      kitchen_section_id: 'buffet_bar',
      pricing: { base: 51.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/Pickled_Eggplants_637469394727509300.jpg'
      },
      item_name: {
        en: 'Pickled Eggplant',
        ar: 'باذنجان مخلل'
      },
      item_description: {
        en: 'Eggplant stuffed with garlic and peppers.',
        ar: 'باذنجان محشو بالثوم والفلفل.'
      }
    },
    {
      id: 5,
      category_id: 'sandwiches',
      kitchen_section_id: 'hot_line',
      pricing: { base: 100.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/20190429_Talabat_UAE_637472695437572843.jpg'
      },
      item_name: {
        en: 'Mutton Kofta Sandwich',
        ar: 'سندويتش كفتة ضاني'
      },
      item_description: {
        en: 'Grilled mutton kofta with tahini and parsley.',
        ar: 'كفتة ضأن مشوية مع طحينة وبقدونس.'
      }
    },
    {
      id: 6,
      category_id: 'sandwiches',
      kitchen_section_id: 'hot_line',
      pricing: { base: 100.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/20190623_Talabat_Qat_637472695443152020.jpg'
      },
      item_name: {
        en: 'Kandouz Kofta Sandwich',
        ar: 'سندويتش كفتة كندوز'
      },
      item_description: {
        en: 'Authentic Egyptian kandouz kofta.',
        ar: 'كفتة كندوز مصرية أصيلة.'
      }
    },
    {
      id: 9,
      category_id: 'sandwiches',
      kitchen_section_id: 'hot_line',
      pricing: { base: 55.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/20210103_Talabat_UAE_637468330976710699.jpg'
      },
      item_name: {
        en: 'Liver Sandwich',
        ar: 'سندويتش كبدة'
      },
      item_description: {
        en: 'Alexandrian liver with hot peppers.',
        ar: 'كبدة اسكندراني بالفلفل الحار.'
      }
    },
    {
      id: 10,
      category_id: 'hawawshi',
      kitchen_section_id: 'hot_line',
      pricing: { base: 120.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/20191225_Talabat_UAE_637472695462881782.jpg'
      },
      item_name: {
        en: 'Darwish Hawawshi',
        ar: 'حواوشي درويش'
      },
      item_description: {
        en: 'Special Hawawshi with our secret blend.',
        ar: 'حواوشي خاص بمزيجنا السري.'
      }
    },
    {
      id: 13,
      category_id: 'hawawshi',
      kitchen_section_id: 'hot_line',
      pricing: { base: 120.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/20191225_Talabat_UAE_637472695479175846.jpg'
      },
      item_name: {
        en: 'Regular Hawawshi',
        ar: 'حواوشي عادي'
      },
      item_description: {
        en: 'Baladi bread stuffed with seasoned minced meat.',
        ar: 'خبز بلدي محشو باللحم المفروم المتبل.'
      }
    },
    {
      id: 14,
      category_id: 'combo_meals',
      kitchen_section_id: 'hot_line',
      pricing: { base: 149.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/2020-03-08_Talabat_J_637472695484901335.jpg'
      },
      item_name: {
        en: 'Quarter Chicken Meal',
        ar: 'وجبة ربع دجاجة'
      },
      item_description: {
        en: 'Served with salad, soup, rice and bread.',
        ar: 'تقدم مع سلطة وشوربة وأرز وخبز.'
      }
    },
    {
      id: 15,
      category_id: 'combo_meals',
      kitchen_section_id: 'hot_line',
      pricing: { base: 205.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/20200914_Talabat_UAE_637472695491197375.jpg'
      },
      item_name: {
        en: '1/4 Kilo Kofta Meal',
        ar: 'وجبة ربع كيلو كفتة'
      },
      item_description: {
        en: 'Served with salad, soup, rice and bread.',
        ar: 'تقدم مع سلطة وشوربة وأرز وخبز.'
      }
    },
    {
      id: 24,
      category_id: 'kilo_grills',
      kitchen_section_id: 'grill_line',
      pricing: { base: 525.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/blob_637409251309078955'
      },
      item_name: {
        en: 'Kilo Kandouz Kofta',
        ar: 'كيلو كفتة كندوز'
      },
      item_description: {
        en: 'One kilo of grilled Kandouz beef kofta.',
        ar: 'كيلو من كفتة لحم الكندوز المشوية.'
      }
    },
    {
      id: 25,
      category_id: 'kilo_grills',
      kitchen_section_id: 'grill_line',
      pricing: { base: 325.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/blob_637409249062827138'
      },
      item_name: {
        en: 'Kilo Shish Chicken',
        ar: 'كيلو شيش دجاج'
      },
      item_description: {
        en: 'One kilo of grilled shish tawook.',
        ar: 'كيلو من شيش طاووق المشوي.'
      }
    },
    {
      id: 26,
      category_id: 'side_items',
      kitchen_section_id: 'buffet_bar',
      pricing: { base: 68.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/blob_637388275970177367'
      },
      item_name: {
        en: 'Vermicelli Rice',
        ar: 'أرز بالشعرية'
      },
      item_description: {
        en: 'Basmati rice with toasted vermicelli.',
        ar: 'أرز بسمتي مع شعيرية محمصة.'
      }
    },
    {
      id: 27,
      category_id: 'side_items',
      kitchen_section_id: 'buffet_bar',
      pricing: { base: 67.0 },
      media: {
        image: 'https://images.deliveryhero.io/image/talabat/Menuitems/blob_637388276443789280'
      },
      item_name: {
        en: 'Orzo Soup',
        ar: 'شوربة لسان عصفور'
      },
      item_description: {
        en: 'Warm soup with a clear broth.',
        ar: 'شوربة دافئة بمرق صافي.'
      }
    }
  ],

  // --- الإضافات والمنزوعات ---
  modifiers: {
    add_ons: [
      { id: 101, name: { en: 'Extra Mozzarella', ar: 'جبنة موتزاريلا زيادة' }, price_change: 15.0 },
      { id: 102, name: { en: 'Extra Tahini Sauce', ar: 'صوص طحينة إضافي' }, price_change: 8.0 },
      { id: 103, name: { en: 'Extra Roumy Cheese', ar: 'جبنة رومي زيادة' }, price_change: 12.0 },
      { id: 104, name: { en: 'Extra Rice', ar: 'أرز إضافي' }, price_change: 25.0 }
    ],
    removals: [
      { id: 201, name: { en: 'Without Pickles', ar: 'بدون مخلل' }, price_change: 0.0 },
      { id: 202, name: { en: 'Without Onions', ar: 'بدون بصل' }, price_change: 0.0 },
      { id: 203, name: { en: 'Without Tomatoes', ar: 'بدون طماطم' }, price_change: 0.0 }
    ]
  }
};

if (typeof window !== 'undefined') {
  window.database = database;
} else if (typeof global !== 'undefined') {
  global.database = database;
}
