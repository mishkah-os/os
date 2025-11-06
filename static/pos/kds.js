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

    // البيانات الأساسية من WebSocket
    jobOrderHeaders: [],
    jobOrderDetails: [],
    kitchenSections: [],
    menuItems: [],
    menuCategories: [],

    // البيانات المعالجة
    jobOrders: [], // كل job_order حسب القسم

    // حالة الاتصال
    isOnline: false
  };

  // ==================== معالجة البيانات ====================

  /**
   * معالجة order_header و order_line وتجميعها حسب القسم المطبخي
   */
  const processData = () => {
    console.log('[KDS] Processing data...', {
      orderHeaders: state.jobOrderHeaders.length,
      orderLines: state.jobOrderDetails.length,
      sections: state.kitchenSections.length,
      menuItems: state.menuItems.length,
      menuCategories: state.menuCategories.length
    });

    // إنشاء maps للوصول السريع
    const menuItemMap = {};
    state.menuItems.forEach(item => {
      menuItemMap[item.id] = item;
    });

    const menuCategoryMap = {};
    state.menuCategories.forEach(cat => {
      menuCategoryMap[cat.id] = cat;
    });

    const sectionMap = {};
    state.kitchenSections.forEach(section => {
      sectionMap[section.id] = section;
    });

    const headerMap = {};
    state.jobOrderHeaders.forEach(header => {
      const headerId = header.id || header.order_id;
      headerMap[headerId] = header;
    });

    // تجميع order_lines حسب order_id وقسم المطبخ
    // { section_id: { order_id: { header, lines: [] } } }
    const jobsBySection = {};

    state.jobOrderDetails.forEach(line => {
      // دعم أسماء مختلفة للحقول
      const lineOrderId = line.order_id || line.orderId || line.order_header_id;
      const lineItemId = line.item_id || line.itemId || line.menu_item_id;
      const lineStatus = line.status || line.status_id;

      const header = headerMap[lineOrderId];
      if (!header) {
        console.warn('[KDS] Line without header:', line.id, lineOrderId);
        return;
      }

      // تحديد القسم المطبخي
      let sectionId = null;

      // 1. من الصنف مباشرة
      const menuItem = menuItemMap[lineItemId];
      if (menuItem?.kitchen_section_id) {
        sectionId = menuItem.kitchen_section_id;
      }
      // 2. من التصنيف
      else if (menuItem?.category_id) {
        const category = menuCategoryMap[menuItem.category_id];
        if (category?.section_id) {
          sectionId = category.section_id;
        }
      }
      // 3. قسم افتراضي
      if (!sectionId) {
        sectionId = 'general';
      }

      // إنشاء الهيكل
      if (!jobsBySection[sectionId]) {
        jobsBySection[sectionId] = {};
      }

      const headerId = header.id || header.order_id;
      if (!jobsBySection[sectionId][headerId]) {
        jobsBySection[sectionId][headerId] = {
          header: header,
          lines: []
        };
      }

      // إضافة الصنف مع بياناته الكاملة
      jobsBySection[sectionId][headerId].lines.push({
        id: line.id,
        itemId: lineItemId,
        itemName: menuItem?.item_name || line.item_name || { ar: lineItemId || 'Unknown', en: lineItemId || 'Unknown' },
        quantity: line.quantity || 1,
        status: lineStatus || 'pending',
        notes: line.notes || line.prep_notes || ''
      });
    });

    // تحويل إلى قائمة مسطحة للعرض
    const jobOrders = [];
    Object.keys(jobsBySection).forEach(sectionId => {
      const section = sectionMap[sectionId] || {
        id: sectionId,
        section_name: { ar: sectionId, en: sectionId }
      };

      Object.keys(jobsBySection[sectionId]).forEach(orderId => {
        const job = jobsBySection[sectionId][orderId];
        const header = job.header;
        const lines = job.lines;

        // دعم أسماء مختلفة للحقول في header
        const headerOrderNumber = header.order_number || header.orderNumber;
        const headerTableLabel = header.table_label || header.tableLabel || header.table_name || header.tableName;
        const headerCustomerName = header.customer_name || header.customerName || header.guest_name || header.guestName;
        const headerServiceMode = header.service_mode || header.serviceMode || header.order_type || header.orderType;
        const headerCreatedAt = header.created_at || header.createdAt;
        const headerStatus = header.status || header.status_id;

        // حساب الحالة العامة
        const allReady = lines.every(l => l.status === 'ready' || l.status === 'completed');
        const status = allReady && lines.length > 0 ? 'ready' : (headerStatus || 'pending');

        jobOrders.push({
          jobOrderId: `${orderId}:${sectionId}`,
          orderId: orderId,
          orderNumber: headerOrderNumber || orderId,
          tableLabel: headerTableLabel || '',
          customerName: headerCustomerName || '',
          serviceMode: headerServiceMode || 'dine_in',
          createdAt: headerCreatedAt,
          status: status,
          sectionId: sectionId,
          sectionName: section.section_name,
          sectionDescription: section.description || { ar: '', en: '' },
          lines: lines
        });
      });
    });

    state.jobOrders = jobOrders;
    console.log('[KDS] Processed job orders:', jobOrders.length, 'from', state.jobOrderHeaders.length, 'headers');
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
                line.itemName?.[state.lang] || line.itemName?.ar || line.itemId
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
      state.menuItems = window.database.menu_items || [];
      state.menuCategories = window.database.menu_categories || [];

      console.log('[KDS] Loaded static data:', {
        kitchenSections: state.kitchenSections.length,
        menuItems: state.menuItems.length,
        menuCategories: state.menuCategories.length
      });
    }

    // Watch على order_header
    db.watch('order_header', (rows) => {
      state.jobOrderHeaders = rows || [];
      state.isOnline = true;
      console.log('[KDS][WATCH] order_header:', state.jobOrderHeaders.length);
      processData();
      render();
    });

    // Watch على order_line
    db.watch('order_line', (rows) => {
      state.jobOrderDetails = rows || [];
      state.isOnline = true;
      console.log('[KDS][WATCH] order_line:', state.jobOrderDetails.length);
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
