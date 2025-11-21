(function () {
  'use strict';

  var global = window;
  var M = global.Mishkah;
  if (!M) {
    console.error('[Brocker PWA] Mishkah core is required.');
    return;
  }

  var D = M.DSL;
  function ensureDslBinding(source) {
    if (source && source.DSL) {
      D = source.DSL;
      return;
    }
    if (global.Mishkah && global.Mishkah.DSL) {
      D = global.Mishkah.DSL;
    }
  }
  if (!D) {
    ensureDslBinding(global.Mishkah);
    if (!D && global.MishkahAuto && typeof global.MishkahAuto.ready === 'function') {
      try {
        global.MishkahAuto.ready(function (readyM) {
          ensureDslBinding(readyM);
        });
      } catch (err) {
        console.warn('[Brocker PWA] unable to sync Mishkah DSL binding', err);
      }
    }
  }
  var UI = M.UI || {};
  var twcss = (M.utils && M.utils.twcss) || {};
  var tw = typeof twcss.tw === 'function'
    ? twcss.tw
    : function () {
        return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
      };
  var token = typeof twcss.token === 'function' ? twcss.token : function () { return ''; };
  var params = new URLSearchParams(global.location.search || '');
  var BRANCH_ID = params.get('branch') || params.get('branchId') || 'aqar';
  var MODULE_ID = params.get('module') || params.get('moduleId') || 'brocker';

  var REQUIRED_TABLES = new Set([
    'app_settings',
    'hero_slides',
    'regions',
    'unit_types',
    'listings',
    'brokers',
    'units',
    'unit_media',
    'inquiries',
    'ui_labels'
  ]);

  var PREF_STORAGE_KEY = 'brocker:prefs:v2';

  var BASE_I18N = {};

  function buildTranslationMaps(rows) {
    var ui = {};
    var content = {};
    (rows || []).forEach(function (row) {
      if (!row || !row.key) return;
      var lang = row.lang || 'ar';
      var target = row.kind === 'content' ? content : ui;
      if (!target[row.key]) target[row.key] = {};
      target[row.key][lang] = row.text || row.value || row.label || '';
    });
    return { ui: ui, content: content };
  }

  function loadPersistedPrefs() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(PREF_STORAGE_KEY) : null;
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_err) {
      return {};
    }
  }

  function persistPrefs(env) {
    if (!global.localStorage) return;
    try {
      var payload = { theme: env.theme, lang: env.lang, dir: env.dir };
      global.localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      /* noop */
    }
  }

  var persisted = loadPersistedPrefs();

  var initialDatabase = {
    env: {
      theme: persisted.theme || 'dark',
      lang: persisted.lang || 'ar',
      dir: persisted.dir || (persisted.lang === 'ar' ? 'rtl' : 'ltr'),
      i18n: BASE_I18N,
      contentI18n: {}
    },
    meta: {
      branchId: BRANCH_ID,
      moduleId: MODULE_ID
    },
    state: {
      loading: true,
      error: null,
      activeView: 'home',
      filters: {
        regionId: null,
        unitTypeId: null,
        listingType: null
      },
      selectedListingId: null,
      selectedBrokerId: null,
      readyTables: [],
      toast: null,
      dashboard: {
        inquiryStatus: 'all'
      },
      brokerAuth: {
        phone: '',
        stage: 'otp'
      },
      pwa: {
        storageKey: (global.MishkahAuto && global.MishkahAuto.pwa && global.MishkahAuto.pwa.storageKey) || 'mishkah:pwa:installed',
        installRequired: false,
        installed: false,
        showGate: false,
        message: '',
        canPrompt: false,
        manifestUrl: null,
        promptError: null
      }
    },
    data: {
      appSettings: null,
      heroSlides: [],
      regions: [],
      unitTypes: [],
      listings: [],
      brokers: [],
      units: [],
      unitMedia: [],
      unitLayouts: [],
      featureValues: [],
      unitFeatures: [],
      inquiries: [],
      notifications: [],
      uiLabels: []
    }
  };

  var realtime = null;
  var appInstance = null;
  var delegatedAttached = false;
  var domDelegationAttached = false;
  var orderLookupCache = null;

  var MEDIA_FALLBACKS = {
    logo: 'https://cdn.jsdelivr.net/gh/tabler/tabler-icons@latest/icons/filled/building-community.svg',
    hero: 'https://images.unsplash.com/photo-1582719478239-2f66c2401b1b?auto=format&fit=crop&w=1400&q=80',
    listing: 'https://images.unsplash.com/photo-1448630360428-65456885c650?auto=format&fit=crop&w=1400&q=80',
    layout: 'https://images.unsplash.com/photo-1600585154340-0ef3c08f05ff?auto=format&fit=crop&w=1200&q=70',
    broker: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=800&q=70'
  };

  function normalizeMediaUrl(url, fallback) {
    if (url && /^https?:\/\//i.test(url)) return url;
    if (url && url.indexOf('//') === 0) return (global.location ? global.location.protocol : 'https:') + url;
    return fallback || MEDIA_FALLBACKS.listing;
  }

  function activeEnv() {
    return (appInstance && appInstance.database && appInstance.database.env) || initialDatabase.env;
  }

  function currentLang(db) {
    var source = db && db.env ? db.env : activeEnv();
    return (source && source.lang) || 'ar';
  }

  function translate(key, fallback, lang) {
    var env = activeEnv();
    var locale = lang || (env && env.lang) || 'ar';
    var map = (env && env.i18n) || BASE_I18N;
    var entry = map[key];

    // Debug: log كل مرة للتأكد من وجود الترجمة
    if (console && console.log && entry && locale === 'en' && !entry[locale]) {
      console.warn('[translate] Missing EN translation for:', key, 'entry:', entry);
    }

    if (entry && entry[locale]) return entry[locale];
    if (entry && entry.ar) return entry.ar;
    return typeof fallback === 'string' ? fallback : key;
  }

  function contentKey(entity, id, field) {
    return [entity, id, field].filter(Boolean).join('.');
  }

  function translateContent(key, fallback, lang) {
    var env = activeEnv();
    var locale = lang || (env && env.lang) || 'ar';
    var map = (env && env.contentI18n) || {};
    var entry = map[key];
    if (entry && entry[locale]) return entry[locale];
    if (entry && entry.ar) return entry.ar;
    return typeof fallback === 'string' ? fallback : key;
  }

  function applyLabelMaps(env, labels) {
    var maps = buildTranslationMaps(labels);
    return Object.assign({}, env, { i18n: maps.ui, contentI18n: maps.content });
  }

  function localized(entity, id, field, fallback, lang) {
    return translateContent(contentKey(entity, id, field), fallback, lang);
  }

  function resolveDir(lang) {
    return lang && lang.toLowerCase().indexOf('ar') === 0 ? 'rtl' : 'ltr';
  }

  function syncDocumentEnv(env) {
    if (!global.document) return;
    var root = global.document.documentElement;
    var body = global.document.body;
    var theme = env && env.theme ? env.theme : 'dark';
    var lang = env && env.lang ? env.lang : 'ar';
    var dir = env && env.dir ? env.dir : resolveDir(lang);
    if (root) {
      root.setAttribute('lang', lang);
      root.setAttribute('dir', dir);
      root.dataset.theme = theme;
      root.style.setProperty('color-scheme', theme === 'light' ? 'light' : 'dark');
    }
    if (body) {
      body.dataset.theme = theme;
      if (env && env.background_color) {
        body.style.backgroundColor = env.background_color;
      }
    }
  }

  syncDocumentEnv(initialDatabase.env);

  function themed(db, darkClass, lightClass) {
    return db && db.env && db.env.theme === 'light' ? lightClass : darkClass;
  }

  function bindUiEvent(target, type, handler, options) {
    if (!target || !type || typeof handler !== 'function') return false;
    if (UI && UI.events && typeof UI.events.on === 'function') {
      try {
        UI.events.on(target, type, handler, options);
        return true;
      } catch (err) {
        console.warn('[Brocker PWA] UI.events.on failed, falling back to DOM listener', err);
      }
    }
    if (target.addEventListener) {
      target.addEventListener(type, handler, options);
      return true;
    }
    return false;
  }

  function attachUiOrders(app) {
    if (!app) return false;
    if (delegatedAttached) return true;
    if (UI && UI.events && typeof UI.events.attachOrders === 'function') {
      try {
        UI.events.attachOrders(app, orders);
        delegatedAttached = true;
        return true;
      } catch (err) {
        console.warn('[Brocker PWA] UI.events.attachOrders failed, using MishkahAuto.attach', err);
      }
    }
    return false;
  }

  function attachDelegatedOrders(app) {
    if (delegatedAttached) return true;
    if (app && UI && UI.events && typeof UI.events.attachDelegatedOrders === 'function') {
      try {
        UI.events.attachDelegatedOrders(app, orders);
        delegatedAttached = true;
        return true;
      } catch (err) {
        console.warn('[Brocker PWA] UI.events.attachDelegatedOrders failed', err);
      }
    }
    return false;
  }

  function buildOrderLookup() {
    if (orderLookupCache) return orderLookupCache;
    var lookup = {};
    Object.keys(orders).forEach(function (name) {
      var def = orders[name] || {};
      var keys = Array.isArray(def.gkeys) ? def.gkeys : [];
      keys.forEach(function (gkey) {
        if (!lookup[gkey]) lookup[gkey] = [];
        lookup[gkey].push({ name: name, def: def });
      });
    });
    orderLookupCache = lookup;
    return lookup;
  }

  function delegateDomOrders(app) {
    if (domDelegationAttached || !global.document) return false;
    var lookup = buildOrderLookup();
    var supported = ['click', 'change', 'submit'];
    var handler = function (event) {
      var path = event.composedPath ? event.composedPath() : null;
      var nodes = Array.isArray(path) && path.length ? path : [];
      if (!nodes.length && event.target) {
        var current = event.target;
        while (current) {
          nodes.push(current);
          current = current.parentElement;
        }
      }
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!node || !node.getAttribute) continue;
        var gkey = node.getAttribute('data-m-gkey') || node.getAttribute('data-gkey');
        if (!gkey || !lookup[gkey]) continue;
        var candidates = lookup[gkey].filter(function (entry) {
          return !entry.def.on || entry.def.on.indexOf(event.type) !== -1;
        });
        if (!candidates.length) continue;
        var delegatedEvent = event;
        if (event.currentTarget !== node) {
          try {
            delegatedEvent = Object.create(event, {
              currentTarget: { value: node, enumerable: true },
              preventDefault: {
                value: typeof event.preventDefault === 'function' ? event.preventDefault.bind(event) : undefined,
                enumerable: true
              },
              stopPropagation: {
                value: typeof event.stopPropagation === 'function' ? event.stopPropagation.bind(event) : undefined,
                enumerable: true
              },
              stopImmediatePropagation: {
                value:
                  typeof event.stopImmediatePropagation === 'function'
                    ? event.stopImmediatePropagation.bind(event)
                    : undefined,
                enumerable: true
              }
            });
          } catch (err) {
            delegatedEvent = Object.assign({}, event, {
              currentTarget: node,
              preventDefault: typeof event.preventDefault === 'function' ? event.preventDefault.bind(event) : undefined,
              stopPropagation: typeof event.stopPropagation === 'function' ? event.stopPropagation.bind(event) : undefined,
              stopImmediatePropagation:
                typeof event.stopImmediatePropagation === 'function'
                  ? event.stopImmediatePropagation.bind(event)
                  : undefined
            });
          }
        }
        candidates.forEach(function (entry) {
          try {
            entry.def.handler(delegatedEvent, app);
          } catch (err) {
            console.warn('[Brocker PWA] delegated order failed for', entry.name, err);
          }
        });
        break;
      }
    };
    supported.forEach(function (type) {
      bindUiEvent(global.document, type, handler, true);
    });
    domDelegationAttached = true;
    return true;
  }

  function setToast(ctx, payload) {
    ctx.setState(function (db) {
      return Object.assign({}, db, {
        state: Object.assign({}, db.state, { toast: payload })
      });
    });
  }

  function updatePwaState(ctx, patch) {
    ctx.setState(function (db) {
      var current = db.state && db.state.pwa ? db.state.pwa : {};
      var merged = Object.assign({}, current, patch || {});
      if (merged.installRequired && merged.installed) merged.showGate = false;
      else if (merged.installRequired) merged.showGate = !merged.installed;
      return Object.assign({}, db, { state: Object.assign({}, db.state, { pwa: merged }) });
    });
  }

  function setEnvLanguage(ctx, lang) {
    if (!ctx) return;
    var nextLang = lang || 'ar';
    var dir = resolveDir(nextLang);

    // قراءة الـ env الحالي بطريقة آمنة
    var currentEnv = (ctx.database && ctx.database.env) || { lang: 'ar', theme: 'dark', dir: 'rtl' };
    var nextEnv = Object.assign({}, currentEnv, { lang: nextLang, dir: dir });

    // حفظ التفضيلات أولاً
    persistPrefs(nextEnv);
    syncDocumentEnv(nextEnv);

    // تحديث state لتحديث الـ UI فوراً (RTL/LTR)
    ctx.setState(function (db) {
      var updatedEnv = Object.assign({}, db.env, { lang: nextLang, dir: dir });
      // إعادة تطبيق label maps مع اللغة الجديدة
      if (db.data && Array.isArray(db.data.uiLabels)) {
        updatedEnv = applyLabelMaps(updatedEnv, db.data.uiLabels);
      }
      return Object.assign({}, db, { env: updatedEnv });
    });

    // إعادة تحميل البيانات بلغة جديدة من Backend
    console.log('[Brocker PWA] Reloading data with new language:', nextLang);
    reloadDataWithLanguage(ctx, nextLang);
  }

  function setEnvTheme(ctx, theme) {
    if (!ctx) return;
    var nextTheme = theme === 'light' ? 'light' : 'dark';
    ctx.setState(function (db) {
      var currentEnv = db.env || { lang: 'ar', theme: 'dark', dir: 'rtl' };
      var nextEnv = Object.assign({}, currentEnv, { theme: nextTheme });
      persistPrefs(nextEnv);
      syncDocumentEnv(nextEnv);
      return Object.assign({}, db, { env: nextEnv });
    });
  }

  var orders = {
    'ui.view.switch': {
      on: ['click'],
      gkeys: ['nav-home', 'nav-brokers', 'nav-dashboard', 'nav-listing'],
      handler: function (event, ctx) {
        var target = event.currentTarget;
        if (!target) return;
        var view = target.getAttribute('data-view');
        if (!view) return;
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              activeView: view,
              selectedListingId: view === 'listing' ? db.state.selectedListingId : db.state.selectedListingId,
              selectedBrokerId: view === 'brokers' ? db.state.selectedBrokerId : db.state.selectedBrokerId
            })
          });
        });
      }
    },
    'ui.search.form': {
      on: ['submit'],
      gkeys: ['search-form'],
      handler: function (event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
      }
    },
    'ui.search.filter': {
      on: ['change'],
      gkeys: ['search-filter'],
      handler: function (event, ctx) {
        var target = event.target;
        if (!target) return;
        var key = target.getAttribute('data-filter-key');
        if (!key) return;
        var value = target.value || null;
        ctx.setState(function (db) {
          var filters = Object.assign({}, db.state.filters);
          filters[key] = value || null;
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, { filters: filters })
          });
        });
      }
    },
    'ui.search.reset': {
      on: ['click'],
      gkeys: ['search-reset'],
      handler: function (_event, ctx) {
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              filters: { regionId: null, unitTypeId: null, listingType: null }
            })
          });
        });
      }
    },
    'ui.listing.select': {
      on: ['click'],
      gkeys: ['listing-card'],
      handler: function (event, ctx) {
        var target = event.currentTarget;
        if (!target) return;
        var id = target.getAttribute('data-listing-id');
        if (!id) return;
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              selectedListingId: id,
              activeView: 'listing'
            })
          });
        });
      }
    },
    'ui.listing.back': {
      on: ['click'],
      gkeys: ['listing-back'],
      handler: function (_event, ctx) {
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, { activeView: 'home' })
          });
        });
      }
    },
    'ui.inquiry.submit': {
      on: ['submit'],
      gkeys: ['inquiry-form'],
      handler: function (event, ctx) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (!realtime || !event || !event.target || typeof FormData === 'undefined') {
          setToast(ctx, { kind: 'error', message: translate('toast.connection', 'الاتصال غير متاح الآن.') });
          return;
        }
        var form = event.target;
        var listingId = form.getAttribute('data-listing-id');
        var fd = new FormData(form);
        var name = (fd.get('leadName') || '').trim();
        var phone = (fd.get('leadPhone') || '').trim();
        var message = (fd.get('leadMessage') || '').trim();
        var preferred = (fd.get('leadPreferred') || 'any').trim() || 'any';
        if (!listingId || !name || !phone || !message) {
          setToast(ctx, { kind: 'error', message: translate('toast.requiredFields', 'يرجى استكمال الحقول.') });
          return;
        }
        var snapshot = ctx.database;
        var listing = snapshot && snapshot.data ? snapshot.data.listings.find(function (row) { return row.id === listingId; }) : null;
        var record = {
          listing_id: listingId,
          unit_id: listing ? listing.unit_id : null,
          project_id: listing ? listing.project_id || null : null,
          message: message,
          status: 'new',
          contact_name: name,
          contact_phone: phone,
          contact_channel: 'phone',
          preferred_contact_time: preferred,
          notes: 'Lead submitted from Mishkah brocker PWA',
          lang: (snapshot && snapshot.env && snapshot.env.lang) || 'ar',
          created_at: new Date().toISOString()
        };
        realtime.insert('inquiries', record, { reason: 'pwa-lead' })
          .then(function () {
            try { form.reset(); } catch (_err) {}
            setToast(ctx, { kind: 'success', message: translate('toast.sent', 'تم إرسال طلبك بنجاح.') });
          })
          .catch(function (error) {
            console.error('[Brocker PWA] inquiry submit failed', error);
            setToast(ctx, { kind: 'error', message: translate('toast.failed', 'تعذر إرسال الطلب.') });
          });
      }
    },
    'ui.dashboard.inquiryFilter': {
      on: ['change'],
      gkeys: ['inquiry-filter'],
      handler: function (event, ctx) {
        var value = event && event.target ? event.target.value : 'all';
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              dashboard: Object.assign({}, db.state.dashboard, { inquiryStatus: value || 'all' })
            })
          });
        });
      }
    },
    'ui.dashboard.inquiryStatus': {
      on: ['click'],
      gkeys: ['inquiry-status'],
      handler: function (event, ctx) {
        if (!realtime) return;
        var target = event.currentTarget;
        if (!target) return;
        var id = target.getAttribute('data-inquiry-id');
        var nextStatus = target.getAttribute('data-next-status');
        if (!id || !nextStatus) return;
        var inquiry = ctx.database.data.inquiries.find(function (row) { return row.id === id; });
        if (!inquiry) return;
        var updated = Object.assign({}, inquiry, { status: nextStatus });
        realtime.update('inquiries', updated, { reason: 'pwa-dashboard' })
          .then(function () {
            setToast(ctx, { kind: 'success', message: translate('toast.updated', 'تم تحديث الطلب.') });
          })
          .catch(function (error) {
            console.error('[Brocker PWA] update inquiry failed', error);
            setToast(ctx, { kind: 'error', message: translate('toast.notUpdated', 'لم يتم تحديث الطلب.') });
          });
      }
    },
    'ui.dashboard.listingStatus': {
      on: ['click'],
      gkeys: ['listing-status'],
      handler: function (event, ctx) {
        if (!realtime) return;
        var target = event.currentTarget;
        if (!target) return;
        var id = target.getAttribute('data-listing-id');
        var nextStatus = target.getAttribute('data-next-status');
        if (!id || !nextStatus) return;
        var listing = ctx.database.data.listings.find(function (row) { return row.id === id; });
        if (!listing) return;
        var updated = Object.assign({}, listing, { listing_status: nextStatus });
        realtime.update('listings', updated, { reason: 'pwa-dashboard' })
          .then(function () {
            setToast(ctx, { kind: 'success', message: translate('toast.listingUpdated', 'تم تعديل حالة الإعلان.') });
          })
          .catch(function (error) {
            console.error('[Brocker PWA] update listing failed', error);
            setToast(ctx, { kind: 'error', message: translate('toast.listingNotUpdated', 'تعذر تعديل الإعلان.') });
          });
      }
    },
    'ui.broker.select': {
      on: ['click'],
      gkeys: ['broker-card'],
      handler: function (event, ctx) {
        var target = event.currentTarget;
        if (!target) return;
        var brokerId = target.getAttribute('data-broker-id');
        if (!brokerId) return;
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              selectedBrokerId: brokerId,
              activeView: 'brokers'
            })
          });
        });
      }
    },
    'ui.broker.back': {
      on: ['click'],
      gkeys: ['broker-back'],
      handler: function (_event, ctx) {
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, { selectedBrokerId: null })
          });
        });
      }
    },
    'ui.broker.auth': {
      on: ['submit'],
      gkeys: ['broker-auth'],
      handler: function (event, ctx) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (!event || !event.target || typeof FormData === 'undefined') return;
        var fd = new FormData(event.target);
        var phone = (fd.get('brokerPhone') || '').trim();
        var region = (fd.get('brokerRegion') || '').trim();
        if (!phone) {
          setToast(ctx, { kind: 'error', message: translate('toast.brokerPhone', 'أدخل رقم الهاتف.') });
          return;
        }
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              brokerAuth: { phone: phone, region: region || null, stage: 'otp' }
            })
          });
        });
        setToast(ctx, { kind: 'success', message: 'تم إرسال رمز التحقق عبر واتساب.' });
      }
    },
    'ui.toast.dismiss': {
      on: ['click'],
      gkeys: ['toast-dismiss'],
      handler: function (_event, ctx) {
        ctx.setState(function (db) {
          return Object.assign({}, db, { state: Object.assign({}, db.state, { toast: null }) });
        });
      }
    },
    'ui.pwa.install': {
      on: ['click'],
      gkeys: ['pwa-install'],
      handler: function (_event, ctx) {
        var helper = global.MishkahAuto && global.MishkahAuto.pwa;
        if (!helper) {
          setToast(ctx, { kind: 'error', message: translate('toast.installError', 'التثبيت غير مدعوم.') });
          return;
        }
        helper.promptInstall()
          .catch(function (error) {
            console.warn('[Brocker PWA] install prompt failed', error);
            setToast(ctx, { kind: 'error', message: translate('toast.installOpenError', 'تعذر فتح نافذة التثبيت.') });
          });
      }
    },
    'ui.pwa.skip': {
      on: ['click'],
      gkeys: ['pwa-skip'],
      handler: function (_event, ctx) {
        var helper = global.MishkahAuto && global.MishkahAuto.pwa;
        if (helper) helper.markInstalled('manual');
        ctx.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              pwa: Object.assign({}, db.state.pwa, { installed: true, showGate: false })
            })
          });
        });
      }
    },
    'ui.env.theme': {
      on: ['click'],
      gkeys: ['theme-toggle'],
      handler: function (event, ctx) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        // قراءة من localStorage مباشرة لتجنب المشاكل
        var persistedPrefs = loadPersistedPrefs();
        var current = persistedPrefs.theme || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';

        console.log('[Brocker PWA] Theme toggle clicked - from', current, 'to', next);
        setEnvTheme(ctx, next);
      }
    },
    'ui.env.lang': {
      on: ['click'],
      gkeys: ['lang-toggle'],
      handler: function (event, ctx) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }

        // قراءة من localStorage مباشرة لتجنب المشاكل
        var persistedPrefs = loadPersistedPrefs();
        var current = persistedPrefs.lang || 'ar';
        var next = current === 'ar' ? 'en' : 'ar';

        console.log('[Brocker PWA] Lang toggle clicked - from', current, 'to', next);
        setEnvLanguage(ctx, next);
      }
    },
    'ui.hero.action': {
      on: ['click'],
      gkeys: ['hero-slide'],
      handler: function (event, ctx) {
        var target = event.currentTarget;
        if (!target) return;
        var action = target.getAttribute('data-cta-action');
        var listingId = target.getAttribute('data-listing-id');
        if (action === 'search') {
          ctx.setState(function (db) {
            return Object.assign({}, db, { state: Object.assign({}, db.state, { activeView: 'home' }) });
          });
          return;
        }
        if (action === 'video') {
          var url = target.getAttribute('data-media-url');
          if (url && global.open) global.open(url, '_blank', 'noopener');
          return;
        }
        if (action === 'broker-onboard') {
          ctx.setState(function (db) {
            return Object.assign({}, db, {
              state: Object.assign({}, db.state, { activeView: 'brokers' })
            });
          });
          return;
        }
        if (listingId) {
          ctx.setState(function (db) {
            return Object.assign({}, db, {
              state: Object.assign({}, db.state, { activeView: 'listing', selectedListingId: listingId })
            });
          });
        }
      }
    }
  };
  function AppView(db) {
    var listingModels = buildListingModels(db);
    var view = db.state.activeView;
    var content;
    if (db.state.loading) content = LoadingSection();
    else if (view === 'listing' && db.state.selectedListingId) content = ListingDetailView(db, listingModels);
    else if (view === 'brokers') content = BrokersView(db, listingModels);
    else if (view === 'dashboard') content = DashboardView(db, listingModels);
    else content = HomeView(db, listingModels);

    var toast = db.state.toast ? ToastBanner(db.state.toast) : null;
    var errorBanner = db.state.error ? ErrorBanner(db.state.error) : null;
    var installBanner = (!db.state.loading && db.state.pwa && !db.state.pwa.showGate && !db.state.pwa.installed)
      ? InstallBanner(db)
      : null;

    return D.Containers.Main({ attrs: { class: tw('relative min-h-screen pt-14 pb-20 transition-colors', themed(db, 'bg-slate-950 text-slate-100', 'bg-slate-50 text-slate-900'), token('body')) } }, [
      PreferencesBar(db),
      errorBanner,
      toast,
      content,
      BottomNav(db),
      installBanner,
      db.state.pwa && db.state.pwa.showGate ? InstallGate(db) : null
    ]);
  }

  function PreferencesBar(db) {
    var lang = currentLang(db);
    var themeIcon = themed(db, '☀️', '🌙');
    var langText = lang === 'ar' ? 'EN' : 'AR';
    var isLoading = db.state && db.state.loading;
    var settings = db.data && db.data.appSettings;
    var brandName = settings && settings.brand_name ? settings.brand_name : 'مكاتب عقارات';
    var brandLogo = settings && settings.brand_logo ? settings.brand_logo : '/projects/brocker/images/logo.svg';
    var displayName = lang === 'en' ? 'Makateb Aqarat' : brandName;

    return D.Containers.Div({ attrs: { class: tw('fixed top-0 left-0 right-0 z-40 backdrop-blur-xl border-b transition-all duration-300', themed(db, 'bg-slate-950/90 border-white/5', 'bg-white/90 border-slate-200')) } }, [
      D.Containers.Div({ attrs: { class: 'mx-auto flex max-w-xl items-center justify-between px-4 py-3' } }, [
        D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
          D.Media.Img({ attrs: { src: brandLogo, alt: displayName, class: 'h-6 w-6 object-contain' } }),
          D.Text.Span({ attrs: { class: tw('text-sm font-bold tracking-tight', themed(db, 'text-white', 'text-slate-900')) } }, [displayName])
        ]),
        D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
          isLoading ? D.Containers.Div({ attrs: { class: 'flex items-center gap-2 text-xs text-slate-400' } }, [
            D.Containers.Div({ attrs: { class: 'animate-spin h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full' } }, []),
            D.Text.Span({}, [translate('misc.loading', 'جاري التحميل...')])
          ]) : null,
          !isLoading ? D.Forms.Button({
            attrs: {
              type: 'button',
              class: tw('flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 active:scale-95', themed(db, 'bg-slate-800 hover:bg-slate-700 text-white', 'bg-slate-100 hover:bg-slate-200 text-slate-800')),
              'data-m-gkey': 'theme-toggle',
              title: translate('actions.toggleTheme', 'تبديل الثيم')
            }
          }, [themeIcon]) : null,
          !isLoading ? D.Forms.Button({
            attrs: {
              type: 'button',
              class: tw('flex items-center justify-center px-4 h-9 rounded-full transition-all duration-200 active:scale-95 font-bold text-sm', themed(db, 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20', 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20')),
              'data-m-gkey': 'lang-toggle',
              title: translate('actions.toggleLang', 'تبديل اللغة')
            }
          }, [
            D.Text.Span({}, [langText])
          ]) : null
        ])
      ])
    ]);
  }

  function FooterSection(settings) {
    var brandName = settings && settings.brand_name ? settings.brand_name : 'عقار برو';
    var brandLogo = settings && settings.brand_logo ? settings.brand_logo : '🏢';
    var heroTitle = settings && settings.hero_title
      ? localized('app_settings', settings.id || 'default', 'hero_title', settings.hero_title)
      : 'منصة متكاملة للوسطاء';
    var heroSubtitle = settings && settings.hero_subtitle
      ? localized('app_settings', settings.id || 'default', 'hero_subtitle', settings.hero_subtitle)
      : 'ابحث، أدر، وتابع طلبات عملائك بسهولة.';
    var whatsapp = settings && settings.support_whatsapp ? settings.support_whatsapp : '';
    var phone = settings && settings.support_phone ? settings.support_phone : '';

    return D.Containers.Footer({ attrs: { class: tw(
      'mt-12 rounded-3xl border p-6 space-y-6 shadow-lg transition-colors',
      themed({ env: activeEnv() }, 'border-white/5 bg-gradient-to-br from-slate-900/85 to-slate-950/90 text-white', 'border-slate-200 bg-white text-slate-900')
    ) } }, [
      // شعار واسم المنصة
      D.Containers.Div({ attrs: { class: 'flex items-center gap-3' } }, [
        D.Text.Span({ attrs: { class: 'text-4xl' } }, [brandLogo]),
        D.Containers.Div({}, [
          D.Text.H3({ attrs: { class: 'text-xl font-bold' } }, [brandName]),
          D.Text.P({ attrs: { class: tw('text-sm', themed({ env: activeEnv() }, 'text-slate-300', 'text-slate-600')) } }, [heroTitle])
        ])
      ]),

      // الوصف
      D.Text.P({ attrs: { class: tw('text-sm leading-relaxed', themed({ env: activeEnv() }, 'text-slate-300', 'text-slate-600')) } }, [heroSubtitle]),

      // فيديو ترويجي
      D.Containers.Div({ attrs: { class: 'rounded-2xl overflow-hidden aspect-video' } }, [
        D.Media.Iframe({
          attrs: {
            src: 'https://www.youtube.com/embed/H1sAFdA-YI4',
            class: 'w-full h-full',
            frameborder: '0',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            allowfullscreen: true,
            title: 'عرض تعريفي'
          }
        })
      ]),

      // زر اشترك معنا
      D.Containers.Div({ attrs: { class: 'flex justify-center' } }, [
        whatsapp ? D.Text.A({
          attrs: {
            href: 'https://wa.me/' + whatsapp.replace(/\D/g, '') + '?text=' + encodeURIComponent('أريد الاشتراك كمكتب عقارات'),
            target: '_blank',
            rel: 'noopener noreferrer',
            class: tw('flex items-center gap-3 px-6 py-3 rounded-full text-base font-bold transition-all shadow-lg', themed({ env: activeEnv() }, 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/30', 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30'))
          }
        }, [
          D.Text.Span({ attrs: { class: 'text-2xl' } }, ['✨']),
          D.Text.Span({}, [translate('footer.subscribe', 'اشترك معنا الآن')])
        ]) : null
      ]),

      // أيقونات التواصل
      D.Containers.Div({ attrs: { class: 'space-y-3' } }, [
        D.Text.P({ attrs: { class: tw('text-sm font-semibold', themed({ env: activeEnv() }, 'text-slate-200', 'text-slate-700')) } }, [translate('footer.contact', 'تواصل معنا')]),
        D.Containers.Div({ attrs: { class: 'flex items-center gap-3 flex-wrap' } }, [
          whatsapp ? D.Text.A({
            attrs: {
              href: 'https://wa.me/' + whatsapp.replace(/\D/g, ''),
              target: '_blank',
              rel: 'noopener noreferrer',
              class: tw('flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all', themed({ env: activeEnv() }, 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30', 'bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30'))
            }
          }, [
            D.Text.Span({ attrs: { class: 'text-xl' } }, ['📱']),
            D.Text.Span({}, ['واتساب'])
          ]) : null,
          phone ? D.Text.A({
            attrs: {
              href: 'tel:' + phone,
              class: tw('flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all', themed({ env: activeEnv() }, 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30', 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/30'))
            }
          }, [
            D.Text.Span({ attrs: { class: 'text-xl' } }, ['📞']),
            D.Text.Span({}, ['اتصل بنا'])
          ]) : null
        ])
      ]),

      // حقوق النشر
      D.Containers.Div({ attrs: { class: tw('pt-4 border-t text-center text-xs', themed({ env: activeEnv() }, 'border-white/10 text-slate-400', 'border-slate-200 text-slate-500')) } }, [
        D.Text.P({}, ['© 2025 ' + brandName + ' • ' + translate('footer.rights', 'جميع الحقوق محفوظة')])
      ])
    ]);
  }

  function HomeView(db, listingModels) {
    var settings = db.data.appSettings;
    var slides = Array.isArray(db.data.heroSlides) ? db.data.heroSlides : [];
    var filtered = filterListings(listingModels, db.state.filters).slice(0, 6);
    var heroSection = slides.length ? HeroSection(settings, slides) : null;
    return D.Containers.Section({ attrs: { class: tw('px-4 pb-6 pt-4 space-y-6 max-w-xl mx-auto') } }, [
      heroSection,
      SearchPanel(db, listingModels),
      LatestListingsGrid(filtered),
      FooterSection(settings)
    ]);
  }
  function ListingDetailView(db, listingModels) {
    var target = listingModels.find(function (model) { return model.listing.id === db.state.selectedListingId; });
    if (!target) {
      return D.Containers.Section({ attrs: { class: 'px-4 py-10 text-center text-slate-400' } }, [translate('misc.noBroker', 'لم يتم العثور على الوحدة المختارة.')]);
    }
    return D.Containers.Section({ attrs: { class: tw('px-4 pb-16 pt-4 max-w-5xl mx-auto space-y-6') } }, [
      DetailToolbar(),
      DetailGallery(target),
      DetailSummary(target),
      InquiryForm(target),
      RelatedHighlights(db, target)
    ]);
  }

  function BrokersView(db, listingModels) {
    var brokers = (db.data.brokers || []).slice().sort(function (a, b) {
      var ar = Number.isFinite(a && a.rating) ? a.rating : 0;
      var br = Number.isFinite(b && b.rating) ? b.rating : 0;
      return br - ar;
    });
    var selected = db.state.selectedBrokerId ? brokers.find(function (entry) { return entry.id === db.state.selectedBrokerId; }) : null;
    var brokerListings = selected ? listingModels.filter(function (model) { return model.listing.broker_id === selected.id; }) : [];
    return D.Containers.Section({ attrs: { class: tw('px-4 pb-16 pt-6 max-w-6xl mx-auto space-y-6') } }, [
      HeaderSection(db.data.appSettings),
      selected ? BrokerProfile(selected, brokerListings) : BrokerGrid(brokers),
      BrokerAuthPanel(db)
    ]);
  }

  function DashboardView(db, listingModels) {
    return D.Containers.Section({ attrs: { class: tw('px-4 pb-16 pt-6 max-w-6xl mx-auto space-y-6') } }, [
      HeaderSection(db.data.appSettings),
      DashboardStats(db, listingModels),
      InquiryBoard(db, listingModels),
      NotificationFeed(db)
    ]);
  }
  function DetailSummary(model) {
    var unit = model.unit || {};
    var broker = model.broker;
    var features = model.features || [];
    var highlights = Array.isArray(model.listing.highlights) ? model.listing.highlights : [];
    return D.Containers.Div({ attrs: { class: tw('space-y-4 rounded-3xl border border-white/5 bg-slate-900/40 p-6') } }, [
      D.Text.H2({ attrs: { class: 'text-xl font-semibold text-white' } }, [localized('listings', model.listing.id, 'headline', model.listing.headline || translate('listing.details', 'تفاصيل الوحدة'))]),
      unit.description ? D.Text.P({ attrs: { class: 'text-sm text-slate-300' } }, [localized('units', unit.id, 'description', unit.description)]) : null,
      D.Containers.Div({ attrs: { class: 'flex flex-wrap gap-3 text-xs text-slate-400' } }, [
        unit.area ? Chip(unit.area + ' م²') : null,
        Number.isFinite(unit.bedrooms) ? Chip(unit.bedrooms + ' غرف') : null,
        Number.isFinite(unit.bathrooms) ? Chip(unit.bathrooms + ' حمام') : null,
        model.region ? Chip(localized('regions', model.region.id, 'name', model.region.name)) : null
      ].filter(Boolean)),
      highlights.length ? D.Containers.Div({ attrs: { class: 'flex flex-wrap gap-2 text-xs' } }, highlights.map(function (text) { return Chip(text); })) : null,
      features.length
        ? D.Containers.Div({ attrs: { class: 'text-sm text-slate-300' } }, [
            D.Text.Strong({ attrs: { class: 'text-slate-100' } }, [translate('listing.features', 'مميزات الوحدة:')]),
            D.Lists.Ul({ attrs: { class: 'mt-2 space-y-1' } }, features.map(function (name) {
              return D.Lists.Li({ attrs: { class: 'text-slate-300' } }, [name]);
            }))
          ])
        : null,
      broker ? BrokerBadge(broker) : null,
      D.Containers.Div({ attrs: { class: 'flex items-center justify-between text-sm pt-2 border-t border-white/5' } }, [
        D.Text.Span({ attrs: { class: 'text-slate-400' } }, [translate('listing.price', 'السعر') || '']),
        D.Text.Strong({ attrs: { class: 'text-emerald-400 text-lg' } }, [formatPrice(model.listing)])
      ])
    ]);
  }
  function InquiryForm(model) {
    return D.Forms.Form({
      attrs: {
        class: tw('space-y-3 rounded-3xl border border-white/5 bg-slate-900/40 p-6'),
        'data-m-gkey': 'inquiry-form',
        'data-listing-id': model.listing.id
      }
    }, [
      D.Text.H3({ attrs: { class: 'text-lg font-semibold text-white' } }, [translate('listing.contact', 'اطلب معاينة أو اتصال')]),
      D.Inputs.Input({ attrs: { name: 'leadName', placeholder: translate('forms.contactName', 'الاسم الكامل'), class: inputClass() } }),
      D.Inputs.Input({ attrs: { name: 'leadPhone', placeholder: translate('forms.contactPhone', 'رقم الجوال'), class: inputClass(), type: 'tel' } }),
      D.Inputs.Select({ attrs: { name: 'leadPreferred', class: inputClass() } }, [
        D.Inputs.Option({ attrs: { value: 'any', selected: true } }, [translate('forms.preferredAny', 'أي وقت') || 'أي وقت']),
        D.Inputs.Option({ attrs: { value: 'morning' } }, [translate('forms.preferredMorning', 'صباحاً') || 'صباحاً']),
        D.Inputs.Option({ attrs: { value: 'evening' } }, [translate('forms.preferredEvening', 'مساءً') || 'مساءً'])
      ]),
      D.Inputs.Textarea({ attrs: { name: 'leadMessage', placeholder: translate('forms.message', 'اذكر احتياجاتك أو موعد التواصل المفضل'), class: inputClass(), rows: 3 } }),
      D.Forms.Button({ attrs: { type: 'submit', class: tw('w-full rounded-full bg-emerald-500 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30') } }, [translate('forms.submit', 'إرسال الطلب')])
    ]);
  }

  function RelatedHighlights(db, model) {
    var notifications = (db.data.notifications || []).filter(function (item) {
      return item.user_id === model.listing.broker_id;
    }).slice(0, 3);
    if (!notifications.length) return null;
    return D.Containers.Div({ attrs: { class: tw('rounded-3xl border border-white/5 bg-slate-900/30 p-4 space-y-2') } }, [
      D.Text.Strong({ attrs: { class: 'text-sm text-slate-200' } }, ['تنبيهات من الوسيط']),
      D.Containers.Ul({ attrs: { class: 'space-y-1 text-sm text-slate-300' } }, notifications.map(function (item) {
        return D.Lists.Li({ attrs: { key: item.id } }, [item.message]);
      }))
    ]);
  }
  function BrokerBadge(broker) {
    return D.Containers.Div({ attrs: { class: 'flex items-center gap-2 rounded-2xl border border-white/5 bg-slate-950/50 px-3 py-2 text-xs text-slate-300' } }, [
      broker.avatar_url ? D.Media.Img({ attrs: { src: normalizeMediaUrl(broker.avatar_url, MEDIA_FALLBACKS.broker), alt: broker.full_name, class: 'h-8 w-8 rounded-full object-cover' } }) : null,
      D.Containers.Div({}, [
        D.Text.Span({ attrs: { class: 'text-sm text-white' } }, [broker.full_name || 'وسيط معتمد']),
        broker.phone ? D.Text.Span({ attrs: { class: 'text-[11px] text-slate-400' } }, [broker.phone]) : null
      ])
    ]);
  }
  function BrokerGrid(brokers) {
    if (!brokers.length) {
      return D.Containers.Div({ attrs: { class: 'text-center text-slate-400 text-sm' } }, ['لا يوجد وسطاء حالياً.']);
    }
    var cards = brokers.map(function (broker) {
      return D.Containers.Article({
        attrs: {
          class: tw('rounded-3xl border border-white/5 bg-slate-900/40 p-4 space-y-2 cursor-pointer hover:border-emerald-400/40'),
          'data-m-gkey': 'broker-card',
          'data-broker-id': broker.id
        }
      }, [
        broker.avatar_url ? D.Media.Img({ attrs: { src: normalizeMediaUrl(broker.avatar_url, MEDIA_FALLBACKS.broker), alt: broker.full_name, class: 'h-12 w-12 rounded-full object-cover' } }) : null,
        D.Text.H3({ attrs: { class: 'text-base font-semibold text-white' } }, [broker.full_name || 'وسيط معتمد']),
        broker.company_name ? D.Text.Span({ attrs: { class: 'text-xs text-slate-400' } }, [broker.company_name]) : null,
        broker.region_id ? D.Text.Span({ attrs: { class: 'text-xs text-slate-500' } }, ['منطقة الخدمة: ' + broker.region_id]) : null,
        broker.rating ? D.Text.Span({ attrs: { class: 'text-xs text-amber-400' } }, ['⭐ ' + broker.rating.toFixed(1)]) : null
      ]);
    });
    return D.Containers.Div({ attrs: { class: 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' } }, cards);
  }

  function BrokerProfile(broker, listingModels) {
    var stats = D.Containers.Div({ attrs: { class: 'flex flex-wrap gap-2 text-xs text-slate-400' } }, [
      broker.region_id ? Chip('منطقة: ' + broker.region_id) : null,
      broker.rating ? Chip('تقييم ' + broker.rating.toFixed(1)) : null,
      broker.active_since ? Chip('منذ ' + broker.active_since) : null
    ].filter(Boolean));
    return D.Containers.Div({ attrs: { class: 'space-y-4' } }, [
      D.Forms.Button({ attrs: { type: 'button', class: 'text-sm text-emerald-400', 'data-m-gkey': 'broker-back' } }, ['← جميع الوسطاء']),
      D.Containers.Div({ attrs: { class: tw('rounded-3xl border border-white/5 bg-slate-900/40 p-6 space-y-3') } }, [
        D.Text.H2({ attrs: { class: 'text-lg font-semibold text-white' } }, [broker.full_name || 'وسيط معتمد']),
        broker.bio ? D.Text.P({ attrs: { class: 'text-sm text-slate-300' } }, [broker.bio]) : null,
        stats,
        D.Containers.Div({ attrs: { class: 'flex flex-wrap gap-2 text-xs text-slate-400' } }, [
          broker.phone ? Chip('📞 ' + broker.phone) : null,
          broker.whatsapp ? Chip('واتساب ' + broker.whatsapp) : null
        ].filter(Boolean))
      ]),
      listingModels.length
        ? D.Containers.Div({ attrs: { class: 'space-y-2' } }, [
            D.Text.H3({ attrs: { class: 'text-base font-semibold text-white' } }, ['وحدات الوسيط']),
            LatestListingsGrid(listingModels)
          ])
        : D.Text.P({ attrs: { class: 'text-sm text-slate-400' } }, ['لا توجد وحدات مرتبطة بهذا الوسيط حالياً.'])
    ]);
  }
  function BrokerAuthPanel(db) {
    return D.Containers.Div({ attrs: { class: tw('rounded-3xl border border-dashed border-white/10 bg-slate-900/30 p-6 space-y-3') } }, [
      D.Text.H3({ attrs: { class: 'text-base font-semibold text-white' } }, ['انضم كوسيط معتمد']),
      D.Text.P({ attrs: { class: 'text-sm text-slate-400' } }, ['سجل بياناتك وسيتم إرسال رمز التحقق عبر واتساب.']),
      D.Forms.Form({ attrs: { class: 'space-y-2', 'data-m-gkey': 'broker-auth' } }, [
        D.Inputs.Input({ attrs: { name: 'brokerName', placeholder: 'الاسم التجاري', class: inputClass() } }),
        D.Inputs.Input({ attrs: { name: 'brokerPhone', placeholder: 'رقم الجوال', class: inputClass(), type: 'tel', required: true } }),
        D.Inputs.Input({ attrs: { name: 'brokerRegion', placeholder: 'منطقة الخدمة الرئيسية', class: inputClass() } }),
        D.Forms.Button({ attrs: { type: 'submit', class: tw('w-full rounded-full bg-emerald-500 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30') } }, ['طلب رمز OTP'])
      ]),
      db.state.brokerAuth && db.state.brokerAuth.phone
        ? D.Text.Small({ attrs: { class: 'text-xs text-slate-400' } }, ['تم إرسال آخر رمز إلى: ' + db.state.brokerAuth.phone])
        : null
    ]);
  }

  function DashboardStats(db, listingModels) {
    var inquiries = db.data.inquiries || [];
    var totalListings = db.data.listings.length;
    var activeListings = (db.data.listings || []).filter(function (listing) { return listing.listing_status === 'active'; }).length;
    var newLeads = inquiries.filter(function (inquiry) { return inquiry.status === 'new'; }).length;
    var cards = [
      { label: 'إجمالي الطلبات', value: inquiries.length },
      { label: 'طلبات جديدة', value: newLeads },
      { label: 'عروض نشطة', value: activeListings },
      { label: 'كل العروض', value: totalListings }
    ].map(function (card) {
      return D.Containers.Div({ attrs: { class: tw('rounded-3xl border border-white/5 bg-slate-900/40 p-4 text-center space-y-1') } }, [
        D.Text.Span({ attrs: { class: 'text-xs text-slate-400' } }, [card.label]),
        D.Text.Strong({ attrs: { class: 'text-2xl text-white' } }, [String(card.value)])
      ]);
    });
    return D.Containers.Div({ attrs: { class: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4' } }, cards);
  }

  function InquiryBoard(db, listingModels) {
    var inquiries = (db.data.inquiries || []).slice().sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (db.state.dashboard.inquiryStatus && db.state.dashboard.inquiryStatus !== 'all') {
      inquiries = inquiries.filter(function (item) { return item.status === db.state.dashboard.inquiryStatus; });
    }
    if (!inquiries.length) {
      return D.Containers.Div({ attrs: { class: 'rounded-3xl border border-white/5 bg-slate-900/30 p-6 text-sm text-slate-400' } }, [translate('dashboard.empty', 'لا توجد طلبات حالياً.')]);
    }
    var listingIndex = indexBy(listingModels.map(function (model) { return model.listing; }), 'id');
    var cards = inquiries.map(function (lead) {
      var listing = listingIndex[lead.listing_id];
      return D.Containers.Article({ attrs: { class: tw('space-y-2 rounded-2xl border border-white/5 bg-slate-950/50 p-4') } }, [
        D.Text.Strong({ attrs: { class: 'text-sm text-white' } }, [lead.contact_name || translate('lead.potential', 'عميل محتمل')]),
        D.Text.Span({ attrs: { class: 'text-xs text-slate-400' } }, [lead.contact_phone || translate('lead.noPhone', 'بدون هاتف')]),
        lead.message ? D.Text.P({ attrs: { class: 'text-sm text-slate-300 line-clamp-3' } }, [lead.message]) : null,
        listing ? D.Text.Span({ attrs: { class: 'text-xs text-slate-500' } }, [translate('listing.details', 'الوحدة') + ': ' + (listing.headline || listing.id)]) : null,
        D.Containers.Div({ attrs: { class: 'flex items-center justify-between text-xs text-slate-500' } }, [
          D.Text.Span({}, [formatDate(lead.created_at)]),
          D.Forms.Button({
            attrs: {
              type: 'button',
              class: tw('rounded-full border px-3 py-1 text-xs', lead.status === 'new' ? 'border-emerald-400 text-emerald-300' : 'border-slate-600 text-slate-400'),
              'data-m-gkey': 'inquiry-status',
              'data-inquiry-id': lead.id,
              'data-next-status': lead.status === 'new' ? 'replied' : 'closed'
            }
          }, [lead.status === 'new' ? translate('dashboard.assign', 'تعيين كمردود') : translate('dashboard.close', 'إغلاق')])
        ])
      ]);
    });
    return D.Containers.Div({ attrs: { class: 'space-y-3' } }, [
      D.Containers.Div({ attrs: { class: 'flex items-center gap-2 text-sm text-slate-400' } }, [
        translate('labels.orderByNewest', 'ترتيب حسب أحدث الطلبات'),
        D.Inputs.Select({ attrs: { class: inputClass('text-xs'), 'data-m-gkey': 'inquiry-filter', value: db.state.dashboard.inquiryStatus } }, [
          D.Inputs.Option({ attrs: { value: 'all' } }, [translate('status.all', 'الكل') || 'الكل']),
          D.Inputs.Option({ attrs: { value: 'new' } }, [translate('status.new', 'جديد')]),
          D.Inputs.Option({ attrs: { value: 'replied' } }, [translate('status.replied', 'تم الرد')]),
          D.Inputs.Option({ attrs: { value: 'closed' } }, [translate('status.closed', 'مغلق')])
        ])
      ]),
      D.Containers.Div({ attrs: { class: 'space-y-3' } }, cards)
    ]);
  }

  function NotificationFeed(db) {
    var notifications = (db.data.notifications || []).slice().sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }).slice(0, 4);
    if (!notifications.length) return null;
    return D.Containers.Div({ attrs: { class: tw('rounded-3xl border border-white/5 bg-slate-900/40 p-4 space-y-3') } }, [
      D.Text.H3({ attrs: { class: 'text-base font-semibold text-white' } }, [translate('misc.noNotifications', 'آخر التنبيهات')]),
      D.Containers.Div({ attrs: { class: 'space-y-2 text-sm text-slate-300' } }, notifications.map(function (item) {
        return D.Containers.Div({ attrs: { key: item.id, class: 'rounded-2xl border border-white/5 bg-slate-950/40 p-3' } }, [
          D.Text.Strong({ attrs: { class: 'text-slate-100' } }, [item.title || translate('notification.title', 'تنبيه')]),
          D.Text.P({ attrs: { class: 'text-xs text-slate-400' } }, [item.message]),
          D.Text.Span({ attrs: { class: 'text-[10px] text-slate-500' } }, [formatDate(item.created_at)])
        ]);
      }))
    ]);
  }
  function ToastBanner(payload) {
    return D.Containers.Div({ attrs: { class: tw('fixed top-4 inset-x-0 mx-auto max-w-md rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-white shadow-lg shadow-black/40 z-40 flex items-center justify-between gap-2') } }, [
      D.Text.Span({}, [payload.message || translate('toast.defaultSuccess', 'تم تنفيذ العملية.')]),
      D.Forms.Button({ attrs: { type: 'button', class: 'text-xs text-slate-400', 'data-m-gkey': 'toast-dismiss' } }, [translate('actions.dismiss', 'إغلاق')])
    ]);
  }

  function ErrorBanner(message) {
    return D.Containers.Div({ attrs: { class: tw('bg-rose-900/60 text-rose-50 text-sm text-center py-2 px-4') } }, [message]);
  }

  function InstallBanner(db) {
    var pwa = db.state.pwa;
    if (!pwa) return null;
    return D.Containers.Div({ attrs: { class: tw('fixed bottom-20 inset-x-0 mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-4 text-sm text-white shadow-2xl shadow-black/50 z-40 space-y-2') } }, [
      D.Text.Strong({ attrs: { class: 'text-base' } }, [translate('pwa.installTitle', 'حوّل المنصة إلى تطبيق')]),
      D.Text.P({ attrs: { class: 'text-xs text-slate-400' } }, [pwa.message || translate('pwa.installDesc', 'ثبّت التطبيق لتحصل على تجربة أسرع وإشعارات فورية.')]),
      D.Containers.Div({ attrs: { class: 'flex gap-2' } }, [
        D.Forms.Button({ attrs: { type: 'button', class: tw('flex-1 rounded-full bg-emerald-500 py-2 text-sm font-semibold text-white'), 'data-m-gkey': 'pwa-install' } }, [translate('actions.install', 'تثبيت')]),
        D.Forms.Button({ attrs: { type: 'button', class: tw('flex-1 rounded-full border border-white/20 py-2 text-sm text-slate-200'), 'data-m-gkey': 'pwa-skip' } }, [translate('actions.skip', 'لاحقاً')])
      ])
    ]);
  }

  function InstallGate(db) {
    var pwa = db.state.pwa;
    return D.Containers.Div({ attrs: { class: tw('fixed inset-0 z-50 grid place-items-center bg-slate-950/95 backdrop-blur') } }, [
      D.Containers.Div({ attrs: { class: tw('max-w-sm space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-center text-white') } }, [
        D.Text.H2({ attrs: { class: 'text-xl font-semibold' } }, [translate('pwa.installRequired', 'تثبيت التطبيق مطلوب')]),
        D.Text.P({ attrs: { class: 'text-sm text-slate-300' } }, [pwa && pwa.message ? pwa.message : translate('pwa.installRequiredDesc', 'لتجربة كاملة على الجوال قم بتثبيت التطبيق كـ PWA.')]),
        D.Forms.Button({ attrs: { type: 'button', class: tw('w-full rounded-full bg-emerald-500 py-2 text-sm font-semibold text-white'), 'data-m-gkey': 'pwa-install' } }, [translate('actions.installNow', 'تثبيت الآن')]),
        D.Forms.Button({ attrs: { type: 'button', class: tw('w-full rounded-full border border-white/20 py-2 text-sm text-slate-200'), 'data-m-gkey': 'pwa-skip' } }, [translate('actions.skip', 'تخطي للاختبار')])
      ])
    ]);
  }

  function BottomNav(db) {
    var navItems = [
      { key: 'nav-home', label: translate('nav.home', 'الرئيسية'), view: 'home', icon: '🏠' },
      { key: 'nav-brokers', label: translate('nav.brokers', 'الوسطاء'), view: 'brokers', icon: '👥' },
      { key: 'nav-dashboard', label: translate('nav.dashboard', 'الطلبات'), view: 'dashboard', icon: '📋' },
      { key: 'nav-listing', label: translate('nav.listing', 'تفاصيل'), view: 'listing', icon: '📍' }
    ];

    var buttons = navItems.map(function (item) {
      var active = db.state.activeView === item.view;
      return D.Forms.Button({
        attrs: {
          type: 'button',
          class: tw(
            'flex-1 flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-2xl transition-all duration-200 active:scale-95',
            active
              ? themed(db, 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30', 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30')
              : themed(db, 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50', 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100')
          ),
          'data-m-gkey': item.key,
          'data-view': item.view
        }
      }, [
        D.Text.Span({ attrs: { class: 'text-lg' } }, [item.icon]),
        D.Text.Span({ attrs: { class: 'text-[10px] font-medium' } }, [item.label])
      ]);
    });

    return D.Containers.Nav({
      attrs: {
        class: tw(
          'fixed bottom-0 left-0 right-0 mx-auto flex max-w-xl gap-1 border-t backdrop-blur-xl p-2 z-30 safe-area-inset-bottom',
          themed(db, 'bg-slate-950/90 border-white/5', 'bg-white/90 border-slate-200')
        )
      }
    }, buttons);
  }

  function LoadingSection() {
    return D.Containers.Section({ attrs: { class: 'flex min-h-screen items-center justify-center text-slate-400' } }, [translate('misc.loading', 'جارِ تحميل بيانات الوسطاء...')]);
  }
  function HeaderSection(settings) {
    if (!settings) {
      return D.Containers.Header({ attrs: { class: tw('space-y-1 text-center text-white') } }, [
        D.Text.H1({ attrs: { class: 'text-2xl font-semibold' } }, ['Brocker Mishkah'])
      ]);
    }
    var brandName = localized('app_settings', settings.id || 'default', 'brand_name', settings.brand_name);
    var brandTagline = localized('app_settings', settings.id || 'default', 'tagline', settings.tagline);
    var logoSrc = settings.brand_logo;
    var logo = logoSrc
      ? D.Media.Img({
          attrs: {
            src: logoSrc,
            alt: brandName || 'Brocker',
            class: 'mx-auto h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border border-emerald-400/20 bg-slate-900/60 p-2 object-contain shadow-lg shadow-emerald-500/10'
          }
        })
      : null;
    return D.Containers.Header({ attrs: { class: tw('space-y-2 text-center text-white sm:space-y-3') } }, [
      logo,
      D.Text.H1({ attrs: { class: 'text-2xl font-semibold sm:text-3xl' } }, [brandName || 'منصة الوسطاء']),
      brandTagline
        ? D.Text.P({ attrs: { class: 'text-sm leading-6 text-slate-300 sm:text-base' } }, [brandTagline])
        : null
    ]);
  }

  function HeroSection(settings, slides) {
    // إزالة المقدمة - نبدأ مباشرة بالـ slides
    var cards = (slides || []).slice().sort(function (a, b) {
      var ap = Number.isFinite(a && a.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
      var bp = Number.isFinite(b && b.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
      return ap - bp;
    }).map(function (slide) {
      return HeroSlideCard(slide);
    });

    // لو مافيش slides، نعرض null (مافيش hero section)
    if (!cards.length) return null;

    return D.Containers.Section({ attrs: { class: tw(
      'rounded-3xl border p-4 sm:p-6 lg:p-7 space-y-3 sm:space-y-4 shadow-lg shadow-emerald-900/20 transition-colors',
      themed({ env: activeEnv() }, 'border-white/5 bg-gradient-to-br from-slate-900/85 to-slate-950/90', 'border-slate-200 bg-white')
    ) } }, [
      D.Containers.Div({ attrs: { class: tw('grid gap-3 sm:gap-4 md:grid-cols-3') } }, cards)
    ]);
  }

  function HeroSlideCard(slide) {
    if (!slide) return null;
    var mediaUrl = normalizeMediaUrl(slide.media_url, MEDIA_FALLBACKS.hero);
    var media = null;
    if (slide.media_type === 'video') {
      media = D.Media.Video({ attrs: { src: slide.media_url, class: 'h-36 w-full rounded-2xl object-cover sm:h-32', autoplay: true, muted: true, loop: true, playsinline: true } });
    } else if (slide.media_url) {
      media = D.Media.Img({ attrs: { src: slide.media_url, alt: slide.title || 'slide', class: 'h-36 w-full rounded-2xl object-cover sm:h-32', loading: 'lazy' } });
    }
    return D.Containers.Article({ attrs: { key: slide.id, class: tw(
      'space-y-3 sm:space-y-4 rounded-2xl border p-4 text-white shadow-md shadow-black/20 transition-colors',
      themed({ env: activeEnv() }, 'border-white/10 bg-slate-950/50', 'border-slate-200 bg-white/80 text-slate-900')
    ), 'data-m-gkey': 'hero-slide', 'data-cta-action': slide.cta_action || '', 'data-media-url': slide.media_url || '' } }, [
      media,
      D.Containers.Div({ attrs: { class: 'space-y-1' } }, [
        D.Text.Strong({ attrs: { class: 'text-sm sm:text-base' } }, [localized('hero_slides', slide.id, 'title', slide.title || 'عرض مميز')]),
        slide.subtitle
          ? D.Text.P({ attrs: { class: 'text-xs leading-5 text-slate-300 sm:text-sm' } }, [localized('hero_slides', slide.id, 'subtitle', slide.subtitle)])
          : null
      ]),
      slide.cta_label
        ? D.Text.Span({ attrs: { class: 'inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300' } }, [
            '•',
            localized('hero_slides', slide.id, 'cta_label', slide.cta_label)
          ])
        : null
    ]);
  }

  function SearchPanel(db, listingModels) {
    var filters = db.state.filters || {};
    var regions = (db.data.regions || []).slice().sort(function (a, b) {
      return (a.priority || 99) - (b.priority || 99);
    });
    var unitTypes = (db.data.unitTypes || []).slice();
    var listingTypeValues = uniqueValues(listingModels.map(function (model) { return model.listing; }), 'listing_type');
    var regionOptions = [D.Inputs.Option({ attrs: { value: '' } }, [translate('search.allRegions', 'كل المناطق')])].concat(regions.map(function (region) {
      return D.Inputs.Option({ attrs: { value: region.id } }, [localized('regions', region.id, 'name', region.name || region.id, currentLang({ env: { lang: db.env.lang } }))]);
    }));
    var unitTypeOptions = [D.Inputs.Option({ attrs: { value: '' } }, [translate('search.allUnitTypes', 'كل أنواع الوحدات')])].concat(unitTypes.map(function (type) {
      return D.Inputs.Option({ attrs: { value: type.id } }, [localized('unit_types', type.id, 'name', type.name || type.id)]);
    }));
    var listingTypeOptions = [D.Inputs.Option({ attrs: { value: '' } }, [translate('search.allListings', 'كل طرق العرض')])].concat(listingTypeValues.map(function (value) {
      return D.Inputs.Option({ attrs: { value: value } }, [formatListingType(value)]);
    }));
    return D.Forms.Form({ attrs: { class: tw('space-y-4 rounded-3xl border border-white/5 bg-slate-900/60 p-6 text-white'), 'data-m-gkey': 'search-form' } }, [
      D.Text.H3({ attrs: { class: 'text-lg font-semibold' } }, [translate('search.title', 'ابحث عن الوحدة المناسبة')]),
      D.Containers.Div({ attrs: { class: 'grid gap-4 md:grid-cols-3' } }, [
        SelectField({ label: translate('search.region', 'المنطقة'), options: regionOptions, value: filters.regionId || '', filterKey: 'regionId' }),
        SelectField({ label: translate('search.unitType', 'نوع الوحدة'), options: unitTypeOptions, value: filters.unitTypeId || '', filterKey: 'unitTypeId' }),
        SelectField({ label: translate('search.listingType', 'نوع العرض'), options: listingTypeOptions, value: filters.listingType || '', filterKey: 'listingType' })
      ]),
      D.Containers.Div({ attrs: { class: 'flex justify-end' } }, [
        D.Forms.Button({ attrs: { type: 'button', class: 'text-sm text-slate-300 underline', 'data-m-gkey': 'search-reset' } }, [translate('actions.resetFilters', 'إعادة التصفية')])
      ])
    ]);
  }

  function LatestListingsGrid(listingModels) {
    if (!listingModels.length) {
      return D.Containers.Div({ attrs: { class: 'text-center text-sm text-slate-400' } }, [translate('listings.empty', 'لا توجد وحدات متاحة حالياً.')]);
    }
    return D.Containers.Div({ attrs: { class: 'grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3' } }, listingModels.map(function (model) {
      return ListingCard(model);
    }));
  }

  function ListingCard(model) {
    var listing = model.listing;
    var unit = model.unit || {};
    var cover = model.coverMedia;
    var coverSrc = normalizeMediaUrl(cover && (cover.media_url || cover.url), MEDIA_FALLBACKS.listing);
    var badges = [
      listing.primary_highlight ? Chip(localized('listings', listing.id, 'primary_highlight', listing.primary_highlight)) : null,
      model.unitType ? Chip(localized('unit_types', model.unitType.id, 'name', model.unitType.name)) : null,
      model.region ? Chip(localized('regions', model.region.id, 'name', model.region.name)) : null,
      listing.listing_type ? Chip(formatListingType(listing.listing_type)) : null
    ].filter(Boolean);
    return D.Containers.Article({
      attrs: {
        class: tw('overflow-hidden rounded-3xl border border-white/5 bg-slate-950/60 text-white cursor-pointer transition hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-900/30'),
        'data-m-gkey': 'listing-card',
        'data-listing-id': listing.id
      }
    }, [
      cover
        ? D.Media.Img({ attrs: { src: cover.url, alt: listing.headline || listing.id, class: 'h-52 w-full object-cover sm:h-48', loading: 'lazy' } })
        : D.Containers.Div({ attrs: { class: 'h-52 w-full sm:h-48 bg-slate-900/70 border-b border-white/5' } }),
      D.Containers.Div({ attrs: { class: 'space-y-3 p-4 sm:p-5' } }, [
        D.Text.Strong({ attrs: { class: 'text-base sm:text-lg' } }, [localized('listings', listing.id, 'headline', listing.headline || 'وحدة متاحة')]),
        listing.excerpt ? D.Text.P({ attrs: { class: 'text-sm text-slate-300 line-clamp-2 leading-6' } }, [localized('listings', listing.id, 'excerpt', listing.excerpt)]) : null,
        badges.length ? D.Containers.Div({ attrs: { class: 'flex flex-wrap gap-2 text-xs text-slate-300' } }, badges) : null,
        D.Containers.Div({ attrs: { class: 'flex items-center justify-between text-sm text-slate-200 pt-3 border-t border-white/5' } }, [
          D.Text.Span({}, [unit.area ? unit.area + ' م²' : '']),
          D.Text.Strong({ attrs: { class: 'text-emerald-300 text-base' } }, [formatPrice(listing)])
        ])
      ])
    ]);
  }

  function DetailToolbar() {
    return D.Containers.Div({ attrs: { class: 'flex items-center justify-between text-sm text-slate-300' } }, [
      D.Forms.Button({ attrs: { type: 'button', class: 'text-slate-300', 'data-m-gkey': 'listing-back' } }, [translate('listing.back', '← العودة للنتائج')]),
      D.Text.Span({}, [translateContent('listing.detail.subtitle', 'استكشف التفاصيل الكاملة للوحدة')])
    ]);
  }

  function DetailGallery(model) {
    var mediaItems = (model.media || []).slice().sort(function (a, b) {
      var ap = Number.isFinite(a && a.priority) ? a.priority : 999;
      var bp = Number.isFinite(b && b.priority) ? b.priority : 999;
      return ap - bp;
    });
    if (!mediaItems.length) {
      return D.Containers.Div({ attrs: { class: tw('rounded-3xl border border-dashed border-white/10 bg-slate-950/40 p-10 text-center text-slate-500') } }, ['لا توجد وسائط للوحدة.']);
    }
    var hero = mediaItems[0];
    var gallery = mediaItems.slice(1, 4);
    return D.Containers.Div({ attrs: { class: 'space-y-3' } }, [
      GalleryMediaItem(hero, 'hero'),
      gallery.length ? D.Containers.Div({ attrs: { class: 'grid gap-3 sm:grid-cols-3' } }, gallery.map(function (item) { return GalleryMediaItem(item, 'thumb'); })) : null
    ]);
  }

  function GalleryMediaItem(media, variant) {
    if (!media) return null;
    var classes = variant === 'hero' ? 'h-72 w-full rounded-3xl object-cover' : 'h-32 w-full rounded-2xl object-cover';
    if (media.media_type === 'video') {
      return D.Media.Video({ attrs: { src: media.url, controls: true, muted: true, class: classes } });
    }
    var fallback = variant === 'layout' ? MEDIA_FALLBACKS.layout : MEDIA_FALLBACKS.listing;
    return D.Media.Img({ attrs: { src: normalizeMediaUrl(media.url, fallback), alt: media.description || 'media', class: classes } });
  }
  function SelectField(config) {
    var options = Array.isArray(config.options) ? config.options : [];
    var value = config.value == null ? '' : config.value;
    return D.Containers.Div({ attrs: { class: 'space-y-1' } }, [
      config.label ? D.Forms.Label({ attrs: { class: 'text-xs text-slate-300' } }, [config.label]) : null,
      D.Inputs.Select({
        attrs: {
          class: inputClass(),
          'data-m-gkey': 'search-filter',
          'data-filter-key': config.filterKey || '',
          value: value
        }
      }, options)
    ]);
  }

  function Chip(text) {
    if (!text) return null;
    return D.Text.Span({ attrs: { class: 'rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300' } }, [text]);
  }

  function inputClass(extra) {
    return tw('w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-emerald-400 outline-none', extra || '');
  }

  function formatPrice(listing) {
    if (!listing) return '';
    var amount = Number(listing.price_amount || listing.price || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return listing.currency ? listing.currency : '—';
    }
    try {
      var lang = initialDatabase.env && initialDatabase.env.lang ? initialDatabase.env.lang : 'ar';
      var fmt = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: listing.currency || 'EGP', maximumFractionDigits: 0 });
      var text = fmt.format(amount);
      if (listing.price_period && listing.price_period !== 'one_time') {
        text += ' / ' + listing.price_period;
      }
      return text;
    } catch (_err) {
      return amount.toLocaleString() + ' ' + (listing.currency || '');
    }
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      var date = value instanceof Date ? value : new Date(value);
      var lang = initialDatabase.env && initialDatabase.env.lang ? initialDatabase.env.lang : 'ar';
      var fmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
      return fmt.format(date);
    } catch (_err) {
      return String(value);
    }
  }

  function formatListingType(value) {
    if (!value) return '';
    var normalized = String(value).toLowerCase();
    if (normalized === 'sale') return translate('listing.type.sale', 'تمليك');
    if (normalized === 'rent') return translate('listing.type.rent', 'إيجار');
    if (normalized === 'lease') return translate('listing.type.lease', 'إيجار تشغيلي');
    if (normalized === 'short-stay') return translate('listing.type.short', 'إيجار قصير');
    return translate('listing.type.' + normalized, value);
  }

  function findById(rows, id) {
    if (!id || !Array.isArray(rows)) return null;
    return rows.find(function (row) { return row && row.id === id; }) || null;
  }

  function indexBy(rows, key) {
    var map = {};
    (rows || []).forEach(function (row) {
      if (!row || row[key] == null) return;
      map[row[key]] = row;
    });
    return map;
  }

  function uniqueValues(rows, key) {
    var seen = new Set();
    var values = [];
    (rows || []).forEach(function (row) {
      if (!row || row[key] == null) return;
      var value = row[key];
      var normalized = typeof value === 'string' ? value : String(value);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      values.push(normalized);
    });
    return values;
  }

  function filterListings(listingModels, filters) {
    var list = Array.isArray(listingModels) ? listingModels : [];
    if (!filters) return list;
    return list.filter(function (model) {
      if (filters.regionId && model.listing.region_id !== filters.regionId) return false;
      if (filters.unitTypeId && (!model.unit || model.unit.unit_type_id !== filters.unitTypeId)) return false;
      if (filters.listingType && model.listing.listing_type !== filters.listingType) return false;
      return true;
    });
  }

  function groupBy(rows, key) {
    var bucket = Object.create(null);
    (rows || []).forEach(function (row) {
      if (!row || row[key] == null) return;
      var id = row[key];
      if (!bucket[id]) bucket[id] = [];
      bucket[id].push(row);
    });
    return bucket;
  }

  function groupFeatures(values, featureIndex) {
    return (values || []).map(function (entry) {
      var def = entry && featureIndex[entry.feature_id];
      var label = def && def.id ? localized('unit_features', def.id, 'name', def.name || 'ميزة') : 'ميزة';
      return entry && entry.value ? label + ': ' + entry.value : label;
    });
  }

  function buildListingModels(db) {
    var listings = (db.data && db.data.listings) || [];
    if (!listings.length) return [];
    var units = indexBy(db.data.units || [], 'id');
    var brokers = indexBy(db.data.brokers || [], 'id');
    var regions = indexBy(db.data.regions || [], 'id');
    var unitTypes = indexBy(db.data.unitTypes || [], 'id');
    var mediaByUnit = groupBy(db.data.unitMedia || [], 'unit_id');
    var layoutsByUnit = groupBy(db.data.unitLayouts || [], 'unit_id');
    var featureValuesByUnit = groupBy(db.data.featureValues || [], 'unit_id');
    var featureIndex = indexBy(db.data.unitFeatures || [], 'id');
    var models = listings.map(function (listing) {
      var unit = listing.unit_id ? units[listing.unit_id] || null : null;
      var broker = listing.broker_id ? brokers[listing.broker_id] || null : null;
      var region = listing.region_id ? regions[listing.region_id] || null : null;
      var mediaList = (mediaByUnit[listing.unit_id] || []).slice().sort(function (a, b) {
        var ap = Number.isFinite(a && a.priority) ? a.priority : 999;
        var bp = Number.isFinite(b && b.priority) ? b.priority : 999;
        return ap - bp;
      });
      var cover = listing.primary_media_id ? findById(mediaList, listing.primary_media_id) : mediaList[0];
      var featureLabels = groupFeatures(featureValuesByUnit[listing.unit_id], featureIndex);
      return {
        listing: listing,
        unit: unit,
        broker: broker,
        region: region,
        unitType: unit && unit.unit_type_id ? unitTypes[unit.unit_type_id] || null : null,
        media: mediaList,
        coverMedia: cover,
        layouts: layoutsByUnit[listing.unit_id] || [],
        features: featureLabels
      };
    });
    return models.sort(function (a, b) {
      var ap = Number.isFinite(a.listing.featured_order) ? a.listing.featured_order : Number.MAX_SAFE_INTEGER;
      var bp = Number.isFinite(b.listing.featured_order) ? b.listing.featured_order : Number.MAX_SAFE_INTEGER;
      if (ap !== bp) return ap - bp;
      return new Date(b.listing.created_at || 0) - new Date(a.listing.created_at || 0);
    });
  }
  function resolveApiBase() {
    if (global.basedomain) return String(global.basedomain).replace(/\/+$/, '');
    if (global.location && global.location.origin) return global.location.origin.replace(/\/+$/, '');
    return '';
  }

  var TABLE_TO_DATA_KEY = {
    app_settings: 'appSettings',
    hero_slides: 'heroSlides',
    regions: 'regions',
    unit_types: 'unitTypes',
    listings: 'listings',
    brokers: 'brokers',
    units: 'units',
    unit_media: 'unitMedia',
    unit_layouts: 'unitLayouts',
    feature_values: 'featureValues',
    unit_features: 'unitFeatures',
    inquiries: 'inquiries',
    notifications: 'notifications',
    ui_labels: 'uiLabels'
  };

  function commitTable(app, tableName, rows) {
    if (!app) return;
    var dataKey = TABLE_TO_DATA_KEY[tableName] || tableName;
    var normalizedRows = Array.isArray(rows) ? rows : [];
    if (tableName === 'hero_slides') {
      normalizedRows = normalizedRows.slice().sort(function (a, b) {
        var ap = Number.isFinite(a && a.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
        var bp = Number.isFinite(b && b.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
        return ap - bp;
      });
    }
    app.setState(function (db) {
      var data = Object.assign({}, db.data);
      var nextEnv = Object.assign({}, db.env);
      data[dataKey] = tableName === 'app_settings' ? (normalizedRows[0] || null) : normalizedRows.slice();
      if (tableName === 'ui_labels') {
        nextEnv = applyLabelMaps(nextEnv, normalizedRows);
      }
      if (tableName === 'app_settings' && normalizedRows[0] && normalizedRows[0].lang) {
        // localStorage له الأولوية على app_settings
        var persistedPrefs = loadPersistedPrefs();
        var lang = persistedPrefs.lang || normalizedRows[0].lang;
        var theme = persistedPrefs.theme || nextEnv.theme;
        nextEnv.lang = lang;
        nextEnv.dir = persistedPrefs.dir || resolveDir(lang);
        nextEnv.theme = theme;
        // لا نُعيد كتابة localStorage إذا كان المستخدم قد اختار لغة
        if (!persistedPrefs.lang) {
          persistPrefs(nextEnv);
        }
        syncDocumentEnv(nextEnv);
      }
      var readyTables = Array.isArray(db.state.readyTables) ? db.state.readyTables.slice() : [];
      if (readyTables.indexOf(tableName) === -1) readyTables.push(tableName);
      var loading = false;
      REQUIRED_TABLES.forEach(function (required) {
        if (readyTables.indexOf(required) === -1) loading = true;
      });
      return Object.assign({}, db, {
        env: nextEnv,
        data: data,
        state: Object.assign({}, db.state, {
          readyTables: readyTables,
          loading: loading
        })
      });
    });
    if (tableName === 'app_settings') {
      var settings = normalizedRows[0] || null;
      updateThemeTokens(settings);
      syncPwaFromSettings(settings);
    }
  }

  function buildManifestUrl() {
    return '/api/pwa/' + encodeURIComponent(BRANCH_ID) + '/' + encodeURIComponent(MODULE_ID) + '/manifest.json';
  }

  function syncPwaFromSettings(settings) {
    var helper = global.MishkahAuto && global.MishkahAuto.pwa;
    var storageKey = settings && settings.pwa_storage_key ? settings.pwa_storage_key : initialDatabase.state.pwa.storageKey;
    if (helper && storageKey) {
      helper.setStorageKey(storageKey);
    }
    if (!appInstance) return;
    updatePwaState(appInstance, {
      storageKey: storageKey,
      installRequired: !!(settings && settings.pwa_install_required),
      message: settings && settings.pwa_install_message ? settings.pwa_install_message : '',
      manifestUrl: settings && settings.pwa_manifest_url ? settings.pwa_manifest_url : buildManifestUrl(),
      installed: helper ? helper.isInstalled(storageKey) : (appInstance.database && appInstance.database.state && appInstance.database.state.pwa && appInstance.database.state.pwa.installed)
    });
  }

  function updateThemeTokens(settings) {
    if (!settings || !global.document) return;
    var root = global.document.documentElement;
    var body = global.document.body;
    if (root && root.style) {
      if (settings.theme_color) root.style.setProperty('--brocker-theme-color', settings.theme_color);
      if (settings.background_color) root.style.setProperty('--brocker-background-color', settings.background_color);
    }
    if (body && settings.background_color) {
      body.style.backgroundColor = settings.background_color;
    }
    var meta = global.document.querySelector && global.document.querySelector('meta[name="theme-color"]');
    if (meta && settings.theme_color) {
      meta.setAttribute('content', settings.theme_color);
    }
  }

  function fetchModuleSchema(branchId, moduleId) {
    var params = new URLSearchParams({ branch: branchId, module: moduleId });
    var base = resolveApiBase();
    var url = (base || '') + '/api/schema?' + params.toString();
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('schema-request-failed');
        return res.json();
      })
      .then(function (payload) {
        var modules = payload && payload.modules ? payload.modules : {};
        var entry = modules[moduleId];
        if (!entry || !entry.schema) {
          throw new Error('schema-missing');
        }
        return { schema: entry.schema, moduleEntry: entry };
      });
  }

  function fetchPwaConfig() {
    var base = resolveApiBase();
    var url = (base || '') + '/api/pwa/' + encodeURIComponent(BRANCH_ID) + '/' + encodeURIComponent(MODULE_ID);
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('pwa-config-missing');
        return res.json();
      })
      .catch(function (error) {
        console.warn('[Brocker PWA] failed to fetch PWA payload', error);
        return null;
      });
  }

  function setupPwaHooks(app) {
    if (!app) return;
    var helper = global.MishkahAuto && global.MishkahAuto.pwa;
    if (helper) {
      updatePwaState(app, { installed: helper.isInstalled(), storageKey: helper.storageKey });
      helper.onBeforeInstallPrompt(function () {
        updatePwaState(app, { canPrompt: helper.hasPendingPrompt ? helper.hasPendingPrompt() : true });
      });
    }
    fetchPwaConfig().then(function (payload) {
      if (!payload) return;
      if (payload.settings) {
        updateThemeTokens(payload.settings);
        syncPwaFromSettings(payload.settings);
      }
      updatePwaState(app, { manifestUrl: buildManifestUrl() });
    });
    bindUiEvent(global, 'appinstalled', function () {
      updatePwaState(app, { installed: true, showGate: false });
    });
  }

  function reloadDataWithLanguage(app, lang) {
    // استخدام appInstance إذا لم يتم تمرير app
    var targetApp = app || appInstance;

    if (!targetApp) {
      console.warn('[Brocker PWA] reloadDataWithLanguage: no app instance available');
      return;
    }

    console.log('[Brocker PWA] Reloading data with lang:', lang);

    // إظهار loading indicator
    targetApp.setState(function (db) {
      return Object.assign({}, db, {
        state: Object.assign({}, db.state, {
          loading: true,
          readyTables: [] // مسح الجداول الجاهزة لإعادة التحميل
        })
      });
    });

    // إعادة تهيئة الاتصال مع اللغة الجديدة
    try {
      // إغلاق الاتصال القديم
      if (realtime && typeof realtime.disconnect === 'function') {
        console.log('[Brocker PWA] Disconnecting old realtime connection');
        realtime.disconnect();
        realtime = null;
      }
    } catch (e) {
      console.warn('[Brocker PWA] Error disconnecting realtime:', e);
    }

    // delay قصير قبل إعادة الاتصال
    setTimeout(function() {
      console.log('[Brocker PWA] Bootstrapping realtime with lang:', lang);
      bootstrapRealtime(targetApp, lang);
    }, 300);
  }

  function bootstrapRealtime(app, forceLang) {
    if (!app) return;
    if (typeof global.createDBAuto !== 'function') {
      console.error('[Brocker PWA] createDBAuto is not available.');
      app.setState(function (db) {
        return Object.assign({}, db, {
          state: Object.assign({}, db.state, { error: 'الاتصال المباشر غير متاح.', loading: false })
        });
      });
      return;
    }

    var currentLang = forceLang || (app.database && app.database.env && app.database.env.lang) || 'ar';

    fetchModuleSchema(BRANCH_ID, MODULE_ID)
      .then(function (payload) {
        var schema = payload && payload.schema ? payload.schema : null;
        if (!schema) throw new Error('schema-invalid');
        var selection = Array.isArray(payload.moduleEntry && payload.moduleEntry.tables) && payload.moduleEntry.tables.length
          ? payload.moduleEntry.tables
          : Object.keys(TABLE_TO_DATA_KEY);
        realtime = global.createDBAuto(schema, selection, {
          branchId: BRANCH_ID,
          moduleId: MODULE_ID,
          role: 'brocker-pwa',
          historyLimit: 200,
          autoReconnect: true,
          logger: console,
          lang: currentLang
        });
        return realtime.ready().then(function () {
          Object.keys(TABLE_TO_DATA_KEY).forEach(function (tableName) {
            realtime.watch(tableName, function (rows) {
              commitTable(app, tableName, Array.isArray(rows) ? rows : []);
            });
          });
          realtime.status(function (status) {
            if (status === 'error') {
              app.setState(function (db) {
                return Object.assign({}, db, {
                  state: Object.assign({}, db.state, { error: 'انقطع الاتصال بقاعدة البيانات.' })
                });
              });
            } else if (status === 'ready') {
              app.setState(function (db) {
                if (!db.state.error) return db;
                return Object.assign({}, db, {
                  state: Object.assign({}, db.state, { error: null })
                });
              });
            }
          });
        });
      })
      .catch(function (error) {
        console.error('[Brocker PWA] failed to bootstrap realtime', error);
        app.setState(function (db) {
          return Object.assign({}, db, {
            state: Object.assign({}, db.state, {
              error: 'تعذر تحميل البيانات، حاول لاحقاً.',
              loading: false
            })
          });
        });
      });
  }

  function finalizeApp(app, opts) {
    if (!app) return;
    var options = opts || {};
    if (!options.skipTwcss && twcss && typeof twcss.auto === 'function') {
      try {
        twcss.auto(initialDatabase, app, { pageScaffold: true });
      } catch (err) {
        console.warn('[Brocker PWA] failed to activate twcss.auto', err);
      }
    }
    delegateDomOrders(app);
    var delegated = attachDelegatedOrders(app);
    var uiAttached = delegated || attachUiOrders(app);
    if (!uiAttached && !options.skipAutoAttach && global.MishkahAuto && typeof global.MishkahAuto.attach === 'function') {
      try {
        global.MishkahAuto.attach(app);
      } catch (err) {
        console.warn('[Brocker PWA] failed to attach MishkahAuto', err);
      }
    }
    attachDelegatedOrders(app);
    setupPwaHooks(app);
    bootstrapRealtime(app);
    global.BrockerPwaApp = app;
  }

  function bootWithAutoDsl() {
    var helper = global.MishkahAuto && global.MishkahAuto.app;
    if (!helper || typeof helper.create !== 'function') return false;
    try {
      var controller = helper.create(initialDatabase, AppView, orders, '#app');
      controller.ready(function (app) {
        appInstance = app;
        finalizeApp(app, { skipTwcss: true, skipAutoAttach: true });
      }).catch(function (error) {
        console.error('[Brocker PWA] DSL helper failed', error);
      });
      return true;
    } catch (err) {
      console.error('[Brocker PWA] unable to boot via MishkahAuto.app', err);
      return false;
    }
  }

  function bootFallback() {
    var readyHelper = global.MishkahAuto && typeof global.MishkahAuto.ready === 'function'
      ? global.MishkahAuto.ready.bind(global.MishkahAuto)
      : function (cb) {
          return Promise.resolve().then(function () {
            if (typeof cb === 'function') cb(M);
            return M;
          });
        };
    return readyHelper(function (readyM) {
      if (!readyM || !readyM.app || typeof readyM.app.createApp !== 'function') {
        throw new Error('mishkah-core-not-ready');
      }
      readyM.app.setBody(AppView);
      var app = readyM.app.createApp(initialDatabase, orders);
      app.mount('#app');
      appInstance = app;
      finalizeApp(app);
      return readyM;
    }).catch(function (error) {
      console.error('[Brocker PWA] fallback boot failed', error);
    });
  }

  if (!bootWithAutoDsl()) {
    bootFallback();
  }
})();
