(function(){
  const M = window.Mishkah;
  if(!M || !M.utils || !M.DSL) return;

  const UI = M.UI || {};
  const U = M.utils;
  const D = M.DSL;
  const { tw, cx } = U.twcss;

  // ==================== النصوص ====================
  const TEXT = {
    title: { ar: "شاشة المطبخ", en: "Kitchen Display" },
    subtitle: { ar: "إدارة التحضير والتسليم لحظيًا", en: "Live preparation management" },
    status: {
      online: { ar: "🟢 متصل", en: "🟢 Online" },
      offline: { ar: "🔴 غير متصل", en: "🔴 Offline" }
    },
    tabs: {
      prep: { ar: "كل الأقسام", en: "All stations" },
      expo: { ar: "شاشة التجميع", en: "Expeditor" }
    },
    empty: {
      station: { ar: "لا توجد أوامر لهذا القسم حاليًا.", en: "No active tickets for this station." }
    },
    actions: {
      start: { ar: "بدء التجهيز", en: "Start prep" },
      finish: { ar: "تم التجهيز", en: "Mark ready" }
    },
    labels: {
      order: { ar: "طلب", en: "Order" },
      table: { ar: "طاولة", en: "Table" },
      station: { ar: "المحطة", en: "Station" }
    }
  };

  // دالة لاستخراج النص حسب اللغة
  const t = (key, lang = 'ar') => {
    const parts = key.split('.');
    let obj = TEXT;
    for (const part of parts) {
      obj = obj?.[part];
      if (!obj) return key;
    }
    return obj?.[lang] || obj?.ar || key;
  };

  // ==================== State ====================
  const state = {
    lang: 'ar',
    theme: 'dark',
    activeTab: 'prep',
    activeSection: null,

    // البيانات من WebSocket - أسماء من pos_schema.json فقط
    jobOrderHeaders: [],  // job_order_header table
    jobOrderDetails: [],  // job_order_detail table
    kitchenSections: [],  // kitchen_sections table

    // البيانات المعالجة للعرض
    jobOrders: [], // قائمة مبسطة من job_order_header + details

    // حالة الاتصال
    isOnline: false
  };

  // ==================== معالجة البيانات ====================

  /**
   * معالجة job_order_header و job_order_detail - الجداول الصحيحة من pos_schema.json
   */
  const processData = () => {
    console.log('[KDS] Processing data...', {
      jobHeaders: state.jobOrderHeaders.length,
      jobDetails: state.jobOrderDetails.length,
      sections: state.kitchenSections.length,
      menuItems: state.menuItems.length
    });

    // إنشاء maps للوصول السريع
    const sectionMap = {};
    state.kitchenSections.forEach(section => {
      sectionMap[section.id] = section;
    });

    // تجميع job_order_detail حسب job_order_id
    const detailsByJobId = {};
    state.jobOrderDetails.forEach(detail => {
      // استخدام الأسماء من pos_schema.json فقط - لا fallbacks
      // job_order_detail fields:
      // - id -> detail_id
      // - jobOrderId -> job_order_id (FK to job_order_header)
      // - itemId -> item_id
      // - itemNameAr -> item_name_ar
      // - itemNameEn -> item_name_en
      // - quantity -> quantity
      // - status -> status
      // - prepNotes -> prep_notes

      const jobOrderId = detail.jobOrderId;
      if (!jobOrderId) return;

      if (!detailsByJobId[jobOrderId]) {
        detailsByJobId[jobOrderId] = [];
      }

      detailsByJobId[jobOrderId].push({
        id: detail.id,
        itemId: detail.itemId,
        itemNameAr: detail.itemNameAr || detail.itemId,
        itemNameEn: detail.itemNameEn || detail.itemId,
        quantity: detail.quantity || 1,
        status: detail.status,
        notes: detail.prepNotes || ''
      });
    });

    // معالجة job_order_header
    const jobOrders = state.jobOrderHeaders.map(header => {
      // استخدام الأسماء من pos_schema.json فقط - لا fallbacks
      // job_order_header fields:
      // - id -> job_order_id
      // - orderId -> order_id
      // - orderNumber -> order_number
      // - serviceMode -> service_mode
      // - stationId -> station_id
      // - stationCode -> station_code
      // - status -> status
      // - totalItems -> total_items
      // - completedItems -> completed_items
      // - remainingItems -> remaining_items
      // - tableLabel -> table_label
      // - customerName -> customer_name
      // - acceptedAt -> accepted_at
      // - createdAt -> created_at

      const jobOrderId = header.id;
      const orderId = header.orderId;
      const orderNumber = header.orderNumber;
      const serviceMode = header.serviceMode;
      const stationId = header.stationId;
      const stationCode = header.stationCode;
      const status = header.status;
      const totalItems = header.totalItems;
      const completedItems = header.completedItems;
      const tableLabel = header.tableLabel;
      const customerName = header.customerName;
      const acceptedAt = header.acceptedAt;
      const createdAt = header.createdAt;

      const details = detailsByJobId[jobOrderId] || [];

      const section = sectionMap[stationId] || {
        id: stationId || 'general',
        section_name: { ar: stationCode || 'عام', en: stationCode || 'General' }
      };

      return {
        jobOrderId: jobOrderId,
        orderId: orderId,
        orderNumber: orderNumber || orderId,
        tableLabel: tableLabel || '',
        customerName: customerName || '',
        serviceMode: serviceMode || 'dine_in',
        createdAt: createdAt || acceptedAt,
        status: status || 'pending',
        totalItems: totalItems || 0,
        completedItems: completedItems || 0,
        sectionId: stationId,
        sectionCode: stationCode,
        sectionName: section.section_name,
        sectionDescription: section.description || { ar: '', en: '' },
        lines: details
      };
    });

    state.jobOrders = jobOrders;
    console.log('[KDS] Processed job orders:', jobOrders.length);
  };

  // ==================== UI ====================

  const Header = () => D('div', {
    class: tw`
      sticky top-0 z-50
      bg-slate-950/95 backdrop-blur-md
      border-b border-slate-800/70
      px-6 py-4
    `
  }, [
    D('div', { class: tw`flex items-center justify-between` }, [
      D('div', {}, [
        D('h1', { class: tw`text-2xl font-bold text-slate-50` }, [
          t('title', state.lang)
        ]),
        D('p', { class: tw`text-sm text-slate-400 mt-1` }, [
          t('subtitle', state.lang)
        ])
      ]),
      D('div', { class: tw`flex items-center gap-4` }, [
        D('div', {
          class: tw`text-sm ${state.isOnline ? 'text-green-400' : 'text-red-400'}`
        }, [
          state.isOnline ? t('status.online', state.lang) : t('status.offline', state.lang)
        ]),
        // زر تغيير اللغة
        D('button', {
          class: tw`px-4 py-2 bg-slate-800/60 hover:bg-slate-700/60
                     text-slate-200 rounded-lg transition-colors`,
          onclick: () => {
            state.lang = state.lang === 'ar' ? 'en' : 'ar';
            document.documentElement.setAttribute('lang', state.lang);
            document.documentElement.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
            render();
          }
        }, [
          state.lang === 'ar' ? 'English' : 'عربي'
        ])
      ])
    ])
  ]);

  const Tabs = () => D('div', {
    class: tw`
      sticky top-[88px] z-40
      bg-slate-900/80 backdrop-blur-md
      border-b border-slate-800/60
      px-6 py-3
    `
  }, [
    D('div', { class: tw`flex gap-2` }, [
      D('button', {
        class: tw`
          px-6 py-2 rounded-lg font-medium transition-all
          ${state.activeTab === 'prep'
            ? 'bg-blue-600 text-white shadow-lg'
            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'}
        `,
        onclick: () => {
          state.activeTab = 'prep';
          state.activeSection = null;
          render();
        }
      }, [t('tabs.prep', state.lang)]),

      D('button', {
        class: tw`
          px-6 py-2 rounded-lg font-medium transition-all
          ${state.activeTab === 'expo'
            ? 'bg-blue-600 text-white shadow-lg'
            : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'}
        `,
        onclick: () => {
          state.activeTab = 'expo';
          render();
        }
      }, [t('tabs.expo', state.lang)])
    ])
  ]);

  const SectionTabs = () => {
    if (state.activeTab !== 'prep') return null;

    return D('div', {
      class: tw`
        sticky top-[148px] z-30
        bg-slate-900/70 backdrop-blur-md
        border-b border-slate-800/50
        px-6 py-3
        overflow-x-auto
      `
    }, [
      D('div', { class: tw`flex gap-2 min-w-max` }, [
        D('button', {
          class: tw`
            px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
            ${!state.activeSection
              ? 'bg-emerald-600 text-white shadow-lg'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'}
          `,
          onclick: () => {
            state.activeSection = null;
            render();
          }
        }, [state.lang === 'ar' ? 'الكل' : 'All']),

        ...state.kitchenSections.map(section =>
          D('button', {
            class: tw`
              px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
              ${state.activeSection === section.id
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'}
            `,
            onclick: () => {
              state.activeSection = section.id;
              render();
            }
          }, [
            section.section_name?.[state.lang] || section.section_name?.ar || section.id
          ])
        )
      ])
    ]);
  };

  const JobCard = (job) => D('div', {
    class: tw`
      bg-slate-800/60 backdrop-blur-sm
      border border-slate-700/60
      rounded-xl p-5
      shadow-lg shadow-slate-950/40
      hover:shadow-xl hover:shadow-slate-950/60
      transition-all duration-300
    `
  }, [
    // رأس البطاقة
    D('div', { class: tw`flex items-start justify-between mb-4` }, [
      D('div', {}, [
        D('h3', { class: tw`text-xl font-bold text-slate-50` }, [
          `${t('labels.order', state.lang)} #${job.orderNumber}`
        ]),
        job.tableLabel && D('p', { class: tw`text-sm text-slate-400 mt-1` }, [
          `${t('labels.table', state.lang)}: ${job.tableLabel}`
        ]),
        job.customerName && D('p', { class: tw`text-sm text-slate-400` }, [
          `${job.customerName}`
        ])
      ]),
      D('div', { class: tw`text-right` }, [
        D('span', {
          class: tw`
            inline-block px-3 py-1 rounded-full text-xs font-medium
            ${job.status === 'ready'
              ? 'bg-green-600/20 text-green-400 border border-green-600/30'
              : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'}
          `
        }, [
          job.status === 'ready'
            ? (state.lang === 'ar' ? 'جاهز' : 'Ready')
            : (state.lang === 'ar' ? 'قيد التحضير' : 'In Progress')
        ])
      ])
    ]),

    // القسم
    D('div', { class: tw`mb-4 pb-3 border-b border-slate-700/50` }, [
      D('p', { class: tw`text-sm font-medium text-emerald-400` }, [
        `${t('labels.station', state.lang)}: ${job.sectionName?.[state.lang] || job.sectionName?.ar || job.sectionId}`
      ])
    ]),

    // الأصناف
    D('div', { class: tw`space-y-2 mb-4` }, [
      ...job.lines.map(line =>
        D('div', {
          class: tw`
            flex items-center justify-between
            p-3 rounded-lg
            bg-slate-900/40
            border border-slate-700/40
          `
        }, [
          D('div', { class: tw`flex items-center gap-3` }, [
            D('span', {
              class: tw`
                flex items-center justify-center
                w-8 h-8 rounded-full
                bg-slate-700/50 text-slate-200
                text-sm font-bold
              `
            }, [
              `${line.quantity}×`
            ]),
            D('div', {}, [
              D('p', { class: tw`text-slate-200 font-medium` }, [
                state.lang === 'ar' ? line.itemNameAr : line.itemNameEn
              ]),
              line.notes && D('p', { class: tw`text-xs text-slate-400 mt-1` }, [
                line.notes
              ])
            ])
          ]),
          D('span', {
            class: tw`
              px-2 py-1 rounded text-xs font-medium
              ${line.status === 'ready'
                ? 'bg-green-600/30 text-green-300'
                : 'bg-slate-700/50 text-slate-300'}
            `
          }, [
            line.status === 'ready'
              ? (state.lang === 'ar' ? '✓ جاهز' : '✓ Ready')
              : (state.lang === 'ar' ? 'قيد التحضير' : 'Preparing')
          ])
        ])
      )
    ]),

    // الأزرار
    D('div', { class: tw`flex gap-2` }, [
      job.status !== 'ready' && D('button', {
        class: tw`
          flex-1 px-4 py-2 rounded-lg font-medium
          bg-blue-600 hover:bg-blue-700
          text-white
          transition-colors
        `,
        onclick: () => {
          // TODO: تحديث حالة الطلب
          console.log('[KDS] Start job:', job.orderId);
        }
      }, [t('actions.start', state.lang)]),

      job.status !== 'ready' && D('button', {
        class: tw`
          flex-1 px-4 py-2 rounded-lg font-medium
          bg-green-600 hover:bg-green-700
          text-white
          transition-colors
        `,
        onclick: () => {
          // TODO: تحديث حالة الطلب
          console.log('[KDS] Finish job:', job.orderId);
        }
      }, [t('actions.finish', state.lang)])
    ])
  ]);

  const PrepView = () => {
    let jobs = state.jobOrders;

    // فلترة حسب القسم المحدد
    if (state.activeSection) {
      jobs = jobs.filter(job => job.sectionId === state.activeSection);
    }

    if (jobs.length === 0) {
      return D('div', {
        class: tw`
          flex items-center justify-center
          min-h-[50vh]
          text-slate-400 text-lg
        `
      }, [
        t('empty.station', state.lang)
      ]);
    }

    return D('div', {
      class: tw`
        grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
        gap-6 p-6
      `
    }, [
      ...jobs.map(job => JobCard(job))
    ]);
  };

  const ExpoView = () => {
    // فقط الطلبات الجاهزة
    const readyJobs = state.jobOrders.filter(job => job.status === 'ready');

    if (readyJobs.length === 0) {
      return D('div', {
        class: tw`
          flex items-center justify-center
          min-h-[50vh]
          text-slate-400 text-lg
        `
      }, [
        state.lang === 'ar' ? 'لا توجد طلبات جاهزة للتجميع' : 'No orders ready for expo'
      ]);
    }

    return D('div', {
      class: tw`
        grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
        gap-6 p-6
      `
    }, [
      ...readyJobs.map(job => JobCard(job))
    ]);
  };

  const App = () => D('div', {
    class: tw`kds-shell min-h-screen`
  }, [
    Header(),
    Tabs(),
    SectionTabs(),
    D('main', { class: tw`pb-12` }, [
      state.activeTab === 'prep' ? PrepView() : ExpoView()
    ])
  ]);

  // ==================== Rendering ====================

  let rootElement = null;

  const render = () => {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
      console.error('[KDS] App container not found');
      return;
    }

    if (!rootElement) {
      rootElement = M.createRoot(appContainer);
    }

    rootElement.render(App());
  };

  // ==================== التهيئة ====================

  const init = () => {
    console.log('[KDS] Initializing...');

    const db = window.__POS_DB__;
    if (!db) {
      console.error('[KDS] Database not found');
      return;
    }

    // تحميل البيانات الثابتة من window.database
    if (window.database) {
      state.kitchenSections = window.database.kitchen_sections || [];

      console.log('[KDS] Loaded static data:', {
        kitchenSections: state.kitchenSections.length
      });
    }

    // Watch على job_order_header - الجدول الصحيح للـ KDS
    db.watch('job_order_header', (rows) => {
      state.jobOrderHeaders = rows || [];
      state.isOnline = true;
      console.log('[KDS][WATCH] job_order_header:', state.jobOrderHeaders.length);
      processData();
      render();
    });

    // Watch على job_order_detail - الجدول الصحيح للـ KDS
    db.watch('job_order_detail', (rows) => {
      state.jobOrderDetails = rows || [];
      state.isOnline = true;
      console.log('[KDS][WATCH] job_order_detail:', state.jobOrderDetails.length);
      processData();
      render();
    });

    // أول رندر
    render();

    console.log('[KDS] Initialized successfully');
  };

  // بدء التطبيق عند تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
