/**
 * Mostamal Hawaa - PWA Mobile Application
 * Schema-driven, fully internationalized, no hardcoded UI text
 * All labels/data resolved from backend seeds
 */

(function() {
  'use strict';

  // ================== MISHKAH SETUP ==================
  var global = window;
  var M = global.Mishkah;
  if (!M) {
    console.error('[SBN PWA] Mishkah core is required.');
    return;
  }

  var D = M.DSL;
  var DEBUG_STORAGE_KEY = 'sbn:pwa:debug';
  function readStoredDebugFlag() {
    try {
      if (global.localStorage) {
        var stored = global.localStorage.getItem(DEBUG_STORAGE_KEY);
        if (stored === '1') return true;
        if (stored === '0') return false;
      }
    } catch (_err) {
      /* ignore */
    }
    return null;
  }
  function persistDebugFlag(flag) {
    try {
      if (!global.localStorage) return;
      if (flag) {
        global.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
      } else {
        global.localStorage.setItem(DEBUG_STORAGE_KEY, '0');
      }
    } catch (_err) {
      /* ignore */
    }
  }
  var initialDebug = typeof global.SBN_PWA_DEBUG === 'boolean'
    ? global.SBN_PWA_DEBUG
    : (readStoredDebugFlag());
  var DEBUG = Boolean(initialDebug);
  function debugLog() {
    if (!DEBUG) return;
    var args = Array.prototype.slice.call(arguments);
    try {
      console.log.apply(console, args);
    } catch (_err) {
      /* ignore logging issues */
    }
  }
  global.SBN_PWA_SET_DEBUG = function(next) {
    DEBUG = Boolean(next);
    persistDebugFlag(DEBUG);
    debugLog('[SBN PWA][debug] mode:', DEBUG ? 'ON' : 'OFF');
  };

  function currentDatabase() {
    if (app && app.database) return app.database;
    return initialDatabase;
  }

  function resolveDataKey(name) {
    if (!name) return null;
    if (TABLE_TO_DATA_KEY[name]) return TABLE_TO_DATA_KEY[name];
    if (currentDatabase().data && currentDatabase().data[name]) return name;
    // attempt to allow using alias without prefix, e.g. 'posts'
    var prefixed = 'sbn_' + name;
    if (TABLE_TO_DATA_KEY[prefixed]) return TABLE_TO_DATA_KEY[prefixed];
    return name;
  }

  function exposeConsoleHelpers() {
    global.SBN_PWA_DUMP = function(tableName, limit) {
      if (!tableName) {
        console.warn('[SBN PWA] Provide a table name, e.g. SBN_PWA_DUMP(\"sbn_posts\", 5)');
        return;
      }
      var key = resolveDataKey(tableName);
      var db = currentDatabase();
      var rows = (db.data && db.data[key]) || [];
      var sample = Array.isArray(rows) ? rows.slice(0, limit || 10) : rows;
      console.log('[SBN PWA][dump]', tableName, '(key:', key + ') count:', Array.isArray(rows) ? rows.length : 0, 'sample:', sample);
      return sample;
    };
    global.SBN_PWA_ENV = function() {
      var db = currentDatabase();
      console.log('[SBN PWA][env]', db.env);
      return db.env;
    };
    global.SBN_PWA_LABEL = function(key) {
      if (!key) {
        console.warn('[SBN PWA] Provide a label key, e.g. SBN_PWA_LABEL(\"app.name\")');
        return null;
      }
      var dict = resolveI18nDictionary();
      console.log('[SBN PWA][label]', key, dict[key]);
      return dict[key];
    };
    global.SBN_PWA_SESSION = function() {
      var db = currentDatabase();
      var activeUserId = db && db.state ? db.state.activeUserId : null;
      var activeUser = getActiveUser(db);
      var usersCount = Array.isArray(db && db.data && db.data.users)
        ? db.data.users.length
        : 0;
      var payload = {
        activeUserId: activeUserId,
        activeUser: activeUser,
        usersCount: usersCount
      };
      console.log('[SBN PWA][session]', payload);
      return payload;
    };
  }
  exposeConsoleHelpers();
  // Support for unified mishkah.js with auto-loading
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
        console.warn('[SBN PWA] unable to sync Mishkah DSL binding', err);
      }
    }
  }

  // TailwindCSS utilities
  var UI = M.UI || {};
  var twcss = (M.utils && M.utils.twcss) || {};
  var tw = typeof twcss.tw === 'function'
    ? twcss.tw
    : function () {
        return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
      };
  var token = typeof twcss.token === 'function' ? twcss.token : function () { return ''; };

  // ================== CONFIGURATION ==================
  var BRANCH_ID = 'sbn';
  var MODULE_ID = 'mostamal';
  var PREF_STORAGE_KEY = 'sbn:prefs:v1';
  var COMPOSER_DRAFT_KEY = 'sbn:composer:draft';
  var ONBOARDING_STORAGE_KEY = 'sbn:onboarding:progress';

  var BASE_I18N = {};
  var realtime = null;
  var COMPOSER_MEDIA_INPUT_ID = 'composer-media-input';
  var MAX_COMPOSER_UPLOADS = 6;
  var deferredInstallPrompt = null;
  var installPromptInitialized = false;
  var SESSION_PWA_KEY = 'sbn:pwa:dismissed';
  var SESSION_STORAGE_KEY = 'sbn:pwa:session';
  var notificationsUnsubscribe = null;
  var DEMO_ACCOUNT = {
    email: 'demo@mostamal.eg',
    password: 'demo123',
    otp: '123456',
    userId: 'usr_001'
  };

  function registerRealtimeStoreInstance(rt) {
    if (!rt || !rt.store) return;
    var registry = global.__MISHKAH_STORE_REGISTRY__;
    if (Array.isArray(registry)) {
      if (registry.indexOf(rt.store) === -1) {
        registry.push(rt.store);
      }
    }
    global.__MISHKAH_LAST_STORE__ = rt.store;
  }

  function clearNotificationWatch() {
    if (typeof notificationsUnsubscribe === 'function') {
      try {
        notificationsUnsubscribe();
      } catch (err) {
        console.warn('[SBN PWA] failed to unsubscribe notifications watch', err);
      }
    }
    notificationsUnsubscribe = null;
  }

  function getNotificationPayloadRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.rows)) return payload.data.rows;
    var record = payload.record || payload.next || payload.current || payload.value;
    if (record) return [record];
    return [];
  }

  function syncNotificationsFromRealtime(rows) {
    if (app && app.database) {
      app.setState(function(db) {
        return {
          env: db.env,
          meta: db.meta,
          state: db.state,
          data: Object.assign({}, db.data, {
            notifications: mergeNotificationRows(db.data.notifications || [], rows)
          })
        };
      });
    } else {
      initialDatabase.data.notifications = mergeNotificationRows(initialDatabase.data.notifications || [], rows);
    }
  }

  function setupNotificationWatch() {
    if (!realtime || !realtime.store || typeof realtime.store.watch !== 'function') {
      clearNotificationWatch();
      return;
    }
    clearNotificationWatch();
    try {
      var unsub = realtime.store.watch('sbn_notifications', function(payload) {
        var entries = getNotificationPayloadRows(payload);
        if (!entries.length) return;
        syncNotificationsFromRealtime(entries);
      });
      if (typeof unsub === 'function') {
        notificationsUnsubscribe = unsub;
      }
      debugLog('[SBN PWA][rt] notification watch active');
    } catch (err) {
      console.warn('[SBN PWA] Failed to watch sbn_notifications', err);
      debugLog('[SBN PWA][rt] notification watch failed', err);
    }
  }

  // ================== TABLE MAPPINGS ==================
  var TABLE_TO_DATA_KEY = {
    'sbn_ui_labels': 'uiLabels',
    'sbn_products': 'products',
    'sbn_services': 'services',
    'sbn_wiki_articles': 'articles',
    'sbn_users': 'users',
    'sbn_posts': 'posts',
    'sbn_comments': 'comments',
    'sbn_hashtags': 'hashtags',
    'sbn_reviews': 'reviews',
    'sbn_classified_categories': 'classifiedCategories',
    'sbn_marketplace_categories': 'marketplaceCategories',
    'sbn_service_categories': 'serviceCategories',
    'sbn_knowledge_categories': 'knowledgeCategories',
    'sbn_notifications': 'notifications'
  };
  var CATEGORY_TABLES = [
    'sbn_classified_categories',
    'sbn_marketplace_categories',
    'sbn_service_categories',
    'sbn_knowledge_categories'
  ];
  var pendingCategoryFetches = {};
  var COMPOSER_CATEGORY_SOURCES = {
    classified: 'classifiedCategories'
  };

  // ================== HELPERS ==================

  function coerceLabelRows(rows) {
    return coerceTableRows(rows);
  }

  function normalizeLocale(value) {
    if (value == null) return '';
    var normalized = String(value).trim().toLowerCase();
    if (!normalized) return '';
    normalized = normalized.replace(/_/g, '-');
    return normalized;
  }

  function normalizeLabelRow(row) {
    if (!row || typeof row !== 'object') return null;
    var key = row.label_key || row.labelKey || row.key;
    var lang = row.lang || row.lang_code || row.language || row.locale;
    var text = row.text || row.translation || row.value || row.label_text;
    if (!key || !lang || typeof text !== 'string') return null;
    var normalizedKey = String(key).trim();
    var normalizedLang = normalizeLocale(lang);
    if (!normalizedKey || !normalizedLang) return null;
    return { key: normalizedKey, lang: normalizedLang, text: text };
  }

  /**
   * Build i18n dictionary from sbn_ui_labels table
   */
  function buildTranslationMaps(rows) {
    var ui = {};
    coerceLabelRows(rows).forEach(function (row) {
      var normalized = normalizeLabelRow(row);
      if (!normalized) return;
      if (!ui[normalized.key]) ui[normalized.key] = {};
      var localeTargets = [normalized.lang];
      var langParts = normalized.lang.split('-');
      if (langParts.length > 1) {
        var baseLang = langParts[0];
        if (baseLang && localeTargets.indexOf(baseLang) === -1) {
          localeTargets.push(baseLang);
        }
      }
      localeTargets.forEach(function(target) {
        if (target && !ui[normalized.key][target]) {
          ui[normalized.key][target] = normalized.text;
        }
      });
    });
    return { ui: ui };
  }

  /**
   * Get current env from app database
   */
  function activeEnv() {
    return app && app.database && app.database.env ? app.database.env : null;
  }

  function coerceTableRows(rows) {
    if (Array.isArray(rows)) return rows;
    if (!rows || typeof rows !== 'object') return [];
    var candidates = ['rows', 'data', 'records', 'items', 'results', 'list', 'payload', 'value', 'values'];
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if (Array.isArray(rows[key])) return rows[key];
    }
    return [];
  }

  function mergeTranslationEntries(base, updates) {
    var target = Object.assign({}, base || {});
    Object.keys(updates || {}).forEach(function(key) {
      var existing = target[key] || {};
      target[key] = Object.assign({}, existing, updates[key]);
    });
    return target;
  }

  function mergeUiLabelRows(existingRows, incomingRows) {
    var registry = {};
    function register(row) {
      var normalized = normalizeLabelRow(row);
      if (!normalized) return;
      var sanitized = Object.assign({}, row, {
        label_key: normalized.key,
        lang: normalized.lang,
        text: normalized.text
      });
      var id = normalized.key + '::' + normalized.lang;
      registry[id] = sanitized;
    }
    coerceLabelRows(existingRows).forEach(register);
    coerceLabelRows(incomingRows).forEach(register);
    return Object.keys(registry).map(function(id) {
      return registry[id];
    });
  }

  function hasEntries(obj) {
    return !!(obj && typeof obj === 'object' && Object.keys(obj).length);
  }

  function resolveI18nDictionary() {
    var env = activeEnv();
    if (hasEntries(env && env.i18n)) {
      return env.i18n;
    }
    if (hasEntries(BASE_I18N)) {
      return BASE_I18N;
    }
    var db = app && app.database;
    var rows = (db && db.data && db.data.uiLabels) || initialDatabase.data.uiLabels || [];
    if (!rows || !rows.length) return {};
    var rebuilt = buildTranslationMaps(rows).ui;
    if (hasEntries(rebuilt)) {
      BASE_I18N = rebuilt;
    }
    return rebuilt;
  }

  /**
   * Translate helper function
   */
  function translate(key, fallback, lang) {
    var env = activeEnv();
    var locale = normalizeLocale(lang || (env && env.lang) || 'ar') || 'ar';
    var normalizedKey = typeof key === 'string' ? key.trim() : key;
    var map = resolveI18nDictionary();
    var entry = map[normalizedKey] || map[key];
    if (entry) {
      if (entry[locale]) return entry[locale];
      if (locale.indexOf('-') !== -1) {
        var base = locale.split('-')[0];
        if (base && entry[base]) return entry[base];
      }
      var altLocale = locale.replace(/-/g, '_');
      if (altLocale && entry[altLocale]) return entry[altLocale];
      if (entry.en) return entry.en;
      if (entry.ar) return entry.ar;
      var firstLocale = Object.keys(entry)[0];
      if (firstLocale && entry[firstLocale]) return entry[firstLocale];
    }
    return typeof fallback === 'string' ? fallback : normalizedKey;
  }

  /**
   * Shorthand for translate
   */
  function t(key, fallback) {
    return translate(key, fallback);
  }

  /**
   * Load persisted preferences
   */
  function loadPersistedPrefs() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(PREF_STORAGE_KEY) : null;
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_err) {
      return {};
    }
  }

  /**
   * Persist preferences
   */
  function persistPrefs(env) {
    if (!global.localStorage) return;
    try {
      var payload = { theme: env.theme, lang: env.lang, dir: env.dir };
      global.localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      /* noop */
    }
  }

  function loadComposerDraft() {
    if (!global.localStorage) return null;
    try {
      var raw = global.localStorage.getItem(COMPOSER_DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function persistComposerDraft(draft) {
    if (!global.localStorage) return;
    try {
      if (!draft || draft.open === false) {
        global.localStorage.removeItem(COMPOSER_DRAFT_KEY);
        return;
      }
      var payload = JSON.stringify(draft);
      global.localStorage.setItem(COMPOSER_DRAFT_KEY, payload);
    } catch (_err) {
      /* noop */
    }
  }

  function loadOnboardingProgress() {
    if (!global.localStorage) return null;
    try {
      var raw = global.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  function persistOnboardingProgress(progress) {
    if (!global.localStorage) return;
    try {
      global.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress || {}));
    } catch (_err) {
      /* noop */
    }
  }

  function loadPersistedSession() {
    if (!global.localStorage) return null;
    try {
      var raw = global.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      var payload = JSON.parse(raw);
      if (payload && payload.userId) {
        return payload;
      }
      return null;
    } catch (_err) {
      return null;
    }
  }

  function persistSession(session) {
    if (!global.localStorage) return;
    try {
      if (!session || !session.userId) {
        global.localStorage.removeItem(SESSION_STORAGE_KEY);
        return;
      }
      var payload = {
        userId: session.userId,
        email: session.email || '',
        updatedAt: Date.now()
      };
      global.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      /* noop */
    }
  }

  function clearPersistedSession() {
    if (!global.localStorage) return;
    try {
      global.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_err) {
      /* noop */
    }
  }

  /**
   * Apply theme to document
   */
  function applyTheme(theme) {
    var resolvedTheme = theme || 'light';
    global.document.documentElement.setAttribute('data-theme', resolvedTheme);
    // Update meta theme-color for mobile browsers
    var metaTheme = global.document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = resolvedTheme === 'dark' ? '#0f172a' : '#6366f1';
    }
  }

  /**
   * Apply language to document
   */
  function applyLang(lang, dir) {
    var resolvedLang = lang || 'ar';
    var resolvedDir = dir || (resolvedLang === 'ar' ? 'rtl' : 'ltr');
    global.document.documentElement.setAttribute('lang', resolvedLang);
    global.document.documentElement.setAttribute('dir', resolvedDir);
  }

  function isPwaPromptSuppressed() {
    try {
      return global.sessionStorage && global.sessionStorage.getItem(SESSION_PWA_KEY) === '1';
    } catch (_err) {
      return false;
    }
  }

  function suppressPwaPromptForSession() {
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(SESSION_PWA_KEY, '1');
      }
    } catch (_err) {
      /* ignore */
    }
  }

  function isStandaloneMode() {
    if (!global || !global.window) return false;
    var matchesDisplayMode = false;
    try {
      if (global.matchMedia) {
        var media = global.matchMedia('(display-mode: standalone)');
        matchesDisplayMode = media && media.matches;
      }
    } catch (_err) {
      matchesDisplayMode = false;
    }
    var navigatorStandalone = global.navigator && global.navigator.standalone;
    return Boolean(matchesDisplayMode || navigatorStandalone);
  }

  function setPwaPromptState(visible) {
    if (visible && isPwaPromptSuppressed()) {
      visible = false;
    }
    if (app) {
      app.setState(function(db) {
        if (db.state.showPwaPrompt === visible) return db;
        return {
          env: db.env,
          meta: db.meta,
          state: Object.assign({}, db.state, { showPwaPrompt: visible }),
          data: db.data
        };
      });
    } else {
      initialDatabase.state.showPwaPrompt = visible;
    }
  }

  function setupPwaInstallPrompt() {
    if (installPromptInitialized || !global || !global.window) return;
    installPromptInitialized = true;
    var markVisibility = function() {
      if (!isStandaloneMode() && !isPwaPromptSuppressed()) {
        setPwaPromptState(true);
      } else {
        setPwaPromptState(false);
      }
    };
    global.window.addEventListener('beforeinstallprompt', function(event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      markVisibility();
    });
    markVisibility();
    if (global.window.matchMedia) {
      try {
        var media = global.window.matchMedia('(display-mode: standalone)');
        var handler = function(evt) {
          if (evt.matches) {
            deferredInstallPrompt = null;
            setPwaPromptState(false);
          }
        };
        if (typeof media.addEventListener === 'function') {
          media.addEventListener('change', handler);
        } else if (typeof media.addListener === 'function') {
          media.addListener(handler);
        }
      } catch (_err) {
        /* noop */
      }
    }
  }

  function renderPwaInstallBanner(db) {
    if (!db.state.showPwaPrompt || isStandaloneMode()) return null;
    return D.Containers.Div({ attrs: { class: 'pwa-install-banner' } }, [
      D.Text.Span({ attrs: { class: 'pwa-text' } }, [
        t('pwa.install.message', 'ثبّت تطبيق مستعمل حواء لفتح الشبكة بسرعة على هاتفك.')
      ]),
      D.Forms.Button({
        attrs: { class: 'hero-cta', 'data-m-gkey': 'pwa-install' }
      }, [t('pwa.install.action', 'تثبيت الآن')]),
      D.Forms.Button({
        attrs: { class: 'chip', 'data-m-gkey': 'pwa-dismiss' }
      }, [t('pwa.install.later', 'لاحقاً')])
    ]);
  }

  // ================== INITIAL STATE ==================
  var persisted = loadPersistedPrefs();
  var persistedSession = loadPersistedSession();
  var persistedComposerDraft = loadComposerDraft();
  var persistedOnboarding = loadOnboardingProgress();

  var initialDatabase = {
    env: {
      theme: persisted.theme || 'dark',
      lang: persisted.lang || 'ar',
      dir: persisted.dir || (persisted.lang === 'ar' ? 'rtl' : 'ltr'),
      i18n: BASE_I18N
    },
    meta: {
      branchId: BRANCH_ID,
      moduleId: MODULE_ID
    },
    state: {
      loading: true,
      error: null,
      notice: null,
      currentSection: 'timeline',
      activeUserId: persistedSession && persistedSession.userId ? persistedSession.userId : null,
      postOverlay: {
        open: false,
        postId: null
      },
      detailOverlay: {
        open: false,
        kind: null,
        targetId: null,
        activeIndex: 0
      },
      homeTab: 'timeline',
      composer: Object.assign({
        open: false,
        mediaMode: 'plain',
        attachmentKind: 'classified',
        text: '',
        targetId: '',
        mediaList: [],
        reelDuration: null,
        linkUrl: '',
        uploadingMedia: false,
        uploadError: null,
        categoryId: '',
        subcategoryId: '',
        classifiedTitle: '',
        classifiedPrice: '',
        contactPhone: '',
        posting: false,
        error: null
      }, persistedComposerDraft || {}),
      onboarding: Object.assign({
        completed: {},
        dismissed: false
      }, persistedOnboarding || {}),
      profileEditor: {
        open: false,
        fullName: '',
        bio: '',
        avatarUrl: ''
      },
      filters: {
        search: '',
        category: '',
        condition: ''
      },
      commentDraft: '',
      showPwaPrompt: false,
      notificationsOpen: false,
      auth: {
        open: false,
        step: 'login',
        fullName: '',
        email: (persistedSession && persistedSession.email) || 'demo@mostamal.eg',
        password: '',
        otp: '',
        error: null,
        pendingUser: null
      }
    },
    data: {
      uiLabels: [],
      products: [],
      services: [],
      articles: [],
      classifiedCategories: [],
      marketplaceCategories: [],
      serviceCategories: [],
      knowledgeCategories: [],
      users: [],
      posts: [],
      comments: [],
      hashtags: [],
      reviews: [],
      classifieds: [],
      notifications: []
    }
  };

  // ================== DATA HELPERS ==================

  function markAppReady() {
    if (!app) return;
    app.setState(function(db) {
      if (db.state.loading === false && !db.state.error) {
        return db;
      }
      return {
        env: db.env,
        meta: db.meta,
        state: Object.assign({}, db.state, { loading: false, error: null }),
        data: db.data
      };
    });
  }

  function generateId(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10);
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_err) {
        return [];
      }
    }
    return [];
  }

  function resolvePrimaryImage(record) {
    if (!record || typeof record !== 'object') return '/projects/sbn/placeholder.jpg';
    if (record.main_image_url) return record.main_image_url;
    if (record.cover_image) return record.cover_image;
    if (record.cover_url) return record.cover_url;
    if (record.avatar_url) return record.avatar_url;
    const media = toArray(record.images || record.media || record.gallery);
    return media.length ? media[0] : '/projects/sbn/placeholder.jpg';
  }

  function resolveProductTitle(product) {
    return getLocalizedField(product, 'title', t('product.untitled'));
  }

  function resolveCityName(record) {
    if (!record || typeof record !== 'object') return '';
    return record.location_city || record.city || record.location || '';
  }

  function formatPriceRange(min, max) {
    if (min == null && max == null) return '';
    if (min != null && max != null && min !== max) {
      return String(min) + ' - ' + String(max);
    }
    const value = min != null ? min : max;
    return value != null ? String(value) : '';
  }

  function parseDateValue(value) {
    if (!value) return 0;
    var ts = Date.parse(value);
    if (Number.isNaN(ts)) return 0;
    return ts;
  }

  function getSortedPosts(db) {
    var posts = db.data.posts || [];
    return posts
      .slice()
      .sort(function (a, b) {
        return parseDateValue(b.created_at || b.createdAt) - parseDateValue(a.created_at || a.createdAt);
      });
  }

  function getCurrentLang() {
    var env = activeEnv();
    return (env && env.lang) || initialDatabase.env.lang || 'ar';
  }

  function getLangBucket(record, lang) {
    if (!record || !record.i18n || !record.i18n.lang) return null;
    var container = record.i18n.lang;
    var requested = lang || getCurrentLang();
    if (container[requested]) return container[requested];
    if (container.ar) return container.ar;
    var firstKey = Object.keys(container)[0];
    return firstKey ? container[firstKey] : null;
  }

  function getLocalizedField(record, field, fallback) {
    if (!record) return fallback || '';
    if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
      return record[field];
    }
    var bucket = getLangBucket(record);
    if (bucket && bucket[field] !== undefined && bucket[field] !== null) {
      return bucket[field];
    }
    return fallback || '';
  }

  function getCategoryDisplayName(cat) {
    if (!cat) return '';
    return getLocalizedField(cat, 'name', cat.title || cat.slug || t('category.untitled'));
  }

  function getCategoryDescription(cat) {
    if (!cat) return '';
    return getLocalizedField(cat, 'description', cat.description || '');
  }

  function buildCategoryHierarchy(categories) {
    var filtered = (categories || []).slice();
    var nodes = {};
    filtered.forEach(function(cat) {
      if (!cat || !cat.category_id) return;
      nodes[cat.category_id] = {
        data: cat,
        children: []
      };
    });
    var roots = [];
    Object.keys(nodes).forEach(function(id) {
      var node = nodes[id];
      var parentId = node.data.parent_id;
      if (parentId && nodes[parentId]) {
        nodes[parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });
    var sortFn = function(a, b) {
      var ao = (a.data && a.data.sort_order) || 0;
      var bo = (b.data && b.data.sort_order) || 0;
      if (ao !== bo) return ao - bo;
      var an = getCategoryDisplayName(a.data);
      var bn = getCategoryDisplayName(b.data);
      return an.localeCompare(bn);
    };
    roots.sort(sortFn);
    roots.forEach(function(root) {
      root.children.sort(sortFn);
    });
    return roots;
  }

  function getLeafCategories(categories, options) {
    var opts = options || {};
    var onlyLeaves = !!opts.onlyLeaves;
    var limit = typeof opts.limit === 'number' ? opts.limit : null;
    var filtered = (categories || []).filter(function(cat) {
      if (onlyLeaves && (cat.parent_id == null || cat.parent_id === '')) return false;
      return true;
    });
    filtered.sort(function(a, b) {
      var ao = a.sort_order || 0;
      var bo = b.sort_order || 0;
      if (ao !== bo) return ao - bo;
      var an = getCategoryDisplayName(a);
      var bn = getCategoryDisplayName(b);
      return an.localeCompare(bn);
    });
    if (limit != null) {
      filtered = filtered.slice(0, limit);
    }
    return filtered;
  }

  function resolveUserName(user) {
    return getLocalizedField(user, 'full_name', user && user.username ? user.username : t('user.unknown'));
  }

  function resolveHashtagLabel(tag) {
    return getLocalizedField(tag, 'name', tag && tag.normalized_name ? '#' + tag.normalized_name : '');
  }

  function normalizeNotificationRows(rows) {
    return coerceTableRows(rows)
      .map(function(entry) {
        if (!entry) return null;
        var clone = Object.assign({}, entry);
        if (!clone.notification_id && clone.id) {
          clone.notification_id = clone.id;
        }
        return clone;
      })
      .filter(Boolean)
      .sort(function(a, b) {
        return parseDateValue(b.created_at) - parseDateValue(a.created_at);
      });
  }

  function mergeNotificationRows(existingRows, incomingRows) {
    var registry = {};
    normalizeNotificationRows(existingRows).forEach(function(entry) {
      var key = entry.notification_id || entry.id;
      if (!key) return;
      registry[key] = entry;
    });
    normalizeNotificationRows(incomingRows).forEach(function(entry) {
      var key = entry.notification_id || entry.id;
      if (!key) return;
      registry[key] = entry;
    });
    return Object.keys(registry).map(function(key) { return registry[key]; })
      .sort(function(a, b) {
        return parseDateValue(b.created_at) - parseDateValue(a.created_at);
      });
  }

  /**
   * Commit table data to app state
   */
  function commitTable(app, tableName, rows) {
    var dataKey = TABLE_TO_DATA_KEY[tableName];
    if (!dataKey) return;

    app.setState(function (db) {
      var newData = {};
      var normalizedRows = tableName === 'sbn_notifications'
        ? mergeNotificationRows(db.data.notifications || [], rows)
        : coerceTableRows(rows);
      debugLog('[SBN PWA][data]', tableName, 'incoming sample:', Array.isArray(normalizedRows) ? normalizedRows.slice(0, 3) : normalizedRows, 'count:', Array.isArray(normalizedRows) ? normalizedRows.length : 0);
      newData[dataKey] = normalizedRows;

      // Special handling for UI labels
      if (tableName === 'sbn_ui_labels') {
        var mergedRows = mergeUiLabelRows(db.data.uiLabels || [], normalizedRows);
        var maps = buildTranslationMaps(mergedRows);
        var mergedI18n = mergeTranslationEntries(db.env && db.env.i18n, maps.ui);
        BASE_I18N = mergeTranslationEntries(BASE_I18N, maps.ui);
        newData[dataKey] = mergedRows;
        debugLog('[SBN PWA][i18n]', 'total labels:', mergedRows.length, 'langs snapshot:', Object.keys(maps.ui || {}).slice(0, 5));
        return {
          env: Object.assign({}, db.env, { i18n: mergedI18n }),
          meta: db.meta,
          state: db.state,
          data: Object.assign({}, db.data, newData)
        };
      }

      return {
        env: db.env,
        meta: db.meta,
        state: db.state,
        data: Object.assign({}, db.data, newData)
      };
    });

    markAppReady();

    if (isCategoryTable(tableName)) {
      refreshLocalizedCategory(tableName, getCurrentLang());
    }
  }

  function updateClassifiedsSnapshot(list) {
    if (!app) return;
    app.setState(function(db) {
      return {
        env: db.env,
        meta: db.meta,
        state: db.state,
        data: Object.assign({}, db.data, {
          classifieds: Array.isArray(list) ? list : []
        })
      };
    });
  }

  function getApiOrigin() {
    return global.location && global.location.origin ? global.location.origin.replace(/\/+$/, '') : '';
  }

  function loadClassifiedsSnapshot(lang) {
    var origin = global.location && global.location.origin ? global.location.origin.replace(/\/+$/, '') : '';
    if (!origin) return Promise.resolve([]);
    var url = origin + '/api/classifieds?lang=' + encodeURIComponent(lang || getCurrentLang());
    debugLog('[SBN PWA][rest] fetching classifieds from', url);
    return fetch(url, { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('classifieds-fetch-failed');
        return response.json();
      })
      .then(function(payload) {
        var classifieds = payload && Array.isArray(payload.classifieds) ? payload.classifieds : [];
        return classifieds;
      })
      .catch(function(error) {
        debugLog('[SBN PWA][rest] classifieds fetch failed', error);
        return [];
      });
  }

  function refreshClassifiedsSnapshot(lang) {
    loadClassifiedsSnapshot(lang)
      .then(function(records) {
        updateClassifiedsSnapshot(records);
      })
      .catch(function(error) {
        debugLog('[SBN PWA][rest] classifieds refresh error', error);
      });
  }

  function isCategoryTable(name) {
    return CATEGORY_TABLES.indexOf(name) !== -1;
  }

  function fetchModuleTableRows(tableName, options) {
    var origin = getApiOrigin();
    if (!origin) return Promise.resolve([]);
    var payload = {
      branchId: BRANCH_ID,
      moduleId: MODULE_ID,
      table: tableName,
      lang: (options && options.lang) || getCurrentLang(),
      fallbackLang: (options && options.fallbackLang) || 'ar'
    };
    return fetch(origin + '/api/query/module', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(response) {
        if (!response.ok) throw new Error('module-query-failed');
        return response.json();
      })
      .then(function(body) {
        var rows = body && Array.isArray(body.rows) ? body.rows : [];
        debugLog('[SBN PWA][module-query]', tableName, 'rows:', rows.length);
        return rows;
      })
      .catch(function(error) {
        debugLog('[SBN PWA][module-query]', tableName, 'failed', error);
        return [];
      });
  }

  function applyLocalizedCategoryRows(tableName, rows, lang) {
    if (!app) return;
    var key = TABLE_TO_DATA_KEY[tableName];
    if (!key) return;
    var targetLang = lang || getCurrentLang();
    var normalizedRows = coerceTableRows(rows).map(function(entry) {
      if (!entry || !entry.i18n || !entry.i18n.lang) return entry;
      var bucket = entry.i18n.lang[targetLang];
      if (!bucket) return entry;
      return Object.assign({}, entry, bucket);
    });
    app.setState(function(db) {
      var patch = {};
      patch[key] = normalizedRows;
      return {
        env: db.env,
        meta: db.meta,
        state: db.state,
        data: Object.assign({}, db.data, patch)
      };
    });
  }

  function refreshLocalizedCategory(tableName, lang) {
    if (!isCategoryTable(tableName)) return Promise.resolve([]);
    if (pendingCategoryFetches[tableName]) return pendingCategoryFetches[tableName];
    var effectiveLang = lang || getCurrentLang();
    var promise = fetchModuleTableRows(tableName, { lang: effectiveLang })
      .then(function(rows) {
        applyLocalizedCategoryRows(tableName, rows, effectiveLang);
        return rows;
      })
      .finally(function() {
        delete pendingCategoryFetches[tableName];
      });
    pendingCategoryFetches[tableName] = promise;
    return promise;
  }

  function refreshLocalizedCategories(lang) {
    return Promise.all(
      CATEGORY_TABLES.map(function(tableName) {
        return refreshLocalizedCategory(tableName, lang || getCurrentLang());
      })
    );
  }

  function uploadMediaFiles(files, options) {
    if (!files || !files.length) return Promise.resolve([]);
    var origin = global.location && global.location.origin ? global.location.origin.replace(/\/+$/, '') : '';
    if (!origin) return Promise.reject(new Error('origin-unresolved'));
    var form = new global.FormData();
    var composer = getComposerState();
    var opts = options || {};
    Array.prototype.slice.call(files, 0, MAX_COMPOSER_UPLOADS).forEach(function(file) {
      if (file) {
        form.append('file', file, file.name || 'upload.jpg');
      }
    });
    var mediaMode = opts.mediaMode || (composer && composer.mediaMode) || 'plain';
    form.append('media_mode', mediaMode);
    if (mediaMode === 'reel') {
      var duration = opts.reelDuration;
      if (duration == null && composer && composer.reelDuration != null) {
        duration = composer.reelDuration;
      }
      if (duration != null) {
        form.append('reel_duration', String(duration));
      }
    }
    return fetch(origin + '/api/uploads', {
      method: 'POST',
      body: form
    })
      .then(function(response) {
        if (!response.ok) throw new Error('upload-failed');
        return response.json();
      })
      .then(function(payload) {
        return Array.isArray(payload.files) ? payload.files : [];
      });
  }

  function validateReelDuration(file) {
    return new Promise(function(resolve, reject) {
      if (!file) {
        reject(new Error('reel-invalid'));
        return;
      }
      if (!global.document || !global.URL || typeof global.URL.createObjectURL !== 'function') {
        resolve(null);
        return;
      }
      try {
        var video = global.document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
          try {
            global.URL.revokeObjectURL(video.src);
          } catch (_err) {
            /* noop */
          }
          resolve(video.duration || null);
        };
        video.onerror = function() {
          reject(new Error('reel-invalid'));
        };
        video.src = global.URL.createObjectURL(file);
      } catch (error) {
        reject(error);
      }
    });
  }

  function handleComposerMediaFiles(ctx, fileList) {
    if (!fileList || !fileList.length) return;
    var composer = getComposerState();
    var isReel = composer.mediaMode === 'reel';
    var files = Array.prototype.slice.call(fileList, 0, isReel ? 1 : MAX_COMPOSER_UPLOADS);
    var initialMediaMode = composer.mediaMode || 'plain';
    var reelDuration = null;
    var validation = Promise.resolve();
    if (isReel) {
      var reelFile = files[0];
      if (!reelFile || typeof reelFile.type !== 'string' || reelFile.type.toLowerCase().indexOf('video') !== 0) {
        applyComposerState(ctx, { uploadError: t('composer.reel.videoOnly', 'يرجى اختيار ملف فيديو صالح') });
        if (global.document) {
          var input = global.document.getElementById(COMPOSER_MEDIA_INPUT_ID);
          if (input) input.value = '';
        }
        return;
      }
      validation = validateReelDuration(reelFile).then(function(duration) {
        if (duration && duration > 30.5) {
          var err = new Error('reel-too-long');
          err.duration = duration;
          throw err;
        }
        reelDuration = duration || null;
        applyComposerState(ctx, { reelDuration: reelDuration });
      });
    }
    applyComposerState(ctx, { uploadingMedia: true, uploadError: null });
    validation
      .then(function() {
        return uploadMediaFiles(files, { mediaMode: initialMediaMode, reelDuration: reelDuration });
      })
      .then(function(files) {
        var urls = files
          .map(function(file) {
            return file && file.url ? file.url : null;
          })
          .filter(Boolean);
        if (!urls.length) {
          applyComposerState(ctx, { uploadingMedia: false, uploadError: t('composer.media.error', 'تعذر رفع الملفات') });
          return;
        }
        applyComposerState(ctx, function(current) {
          var existing = Array.isArray(current.mediaList) ? current.mediaList.slice() : [];
          var next = isReel ? urls.slice(urls.length - 1) : existing.concat(urls).slice(-MAX_COMPOSER_UPLOADS);
          return { mediaList: next, uploadingMedia: false, uploadError: null };
        });
      })
      .catch(function(error) {
        debugLog('[SBN PWA][upload] failed', error);
        var message = t('composer.media.error', 'تعذر رفع الملفات');
        if (error && error.message === 'reel-too-long') {
          message = t('composer.reel.tooLong', 'يجب ألا يتجاوز الفيديو 30 ثانية. الرجاء قص الفيديو وإعادة المحاولة.');
        } else if (error && error.message === 'reel-invalid') {
          message = t('composer.reel.invalid', 'تعذر قراءة ملف الفيديو، يرجى المحاولة بملف آخر.');
        }
        applyComposerState(ctx, { uploadingMedia: false, uploadError: message, reelDuration: null });
      })
      .finally(function() {
        if (global.document) {
          var input = global.document.getElementById(COMPOSER_MEDIA_INPUT_ID);
          if (input) input.value = '';
        }
      });
  }

  function removeComposerMedia(ctx, targetUrl) {
    if (!targetUrl) return;
    applyComposerState(ctx, function(current) {
      var existing = Array.isArray(current.mediaList) ? current.mediaList : [];
      var nextList = existing.filter(function(entry) {
        return entry !== targetUrl;
      });
      var nextState = { mediaList: nextList };
      if (!nextList.length) {
        nextState.reelDuration = null;
      }
      return nextState;
    });
  }

  // ================== VIEW HELPERS ==================

  /**
   * Get filtered products
   */
  function getFilteredProducts(db) {
    var products = db.data.products || [];
    var filters = db.state.filters || {};

    return products.filter(function(product) {
      if (filters.category && product.category_id !== filters.category) {
        return false;
      }
      if (filters.condition && product.condition !== filters.condition) {
        return false;
      }
      if (filters.search) {
        var searchLower = filters.search.toLowerCase();
        var titleText = resolveProductTitle(product).toLowerCase();
        var descText = (product.description || '').toLowerCase();
        var titleMatch = titleText.indexOf(searchLower) !== -1;
        var descMatch = descText.indexOf(searchLower) !== -1;
        if (!titleMatch && !descMatch) return false;
      }
      if (product.status !== 'active') return false;
      return true;
    });
  }

  /**
   * Get filtered services
   */
  function getFilteredServices(db) {
    var services = db.data.services || [];
    var filters = db.state.filters || {};

    return services.filter(function(service) {
      if (filters.category && service.category_id !== filters.category) {
        return false;
      }
      if (filters.search) {
        var searchLower = filters.search.toLowerCase();
        var nameMatch = service.title && service.title.toLowerCase().indexOf(searchLower) !== -1;
        var descMatch = service.description && service.description.toLowerCase().indexOf(searchLower) !== -1;
        if (!nameMatch && !descMatch) return false;
      }
      if (service.status !== 'active') return false;
      return true;
    });
  }

  /**
   * Get wiki articles (top-level)
   */
  function getWikiArticles(db) {
    var articles = db.data.articles || [];
    return articles.filter(function(article) {
      return !article.parent_id && article.status === 'published';
    });
  }

  // ================== VIEW COMPONENTS ==================

  /**
   * Render loading screen
   */
  function renderLoading(db) {
    return D.Containers.Div({ attrs: { class: 'loading-screen' } }, [
      D.Containers.Div({ attrs: { class: 'loading-spinner' } }, []),
      D.Text.P({ attrs: { class: 'loading-text' } }, [
        t('loading.app')
      ])
    ]);
  }

  /**
   * Render error screen
   */
  function renderError(db) {
    return D.Containers.Div({ attrs: { class: 'error-screen' } }, [
      D.Text.H2({}, [t('error.title')]),
      D.Text.P({}, [db.state.error || t('error.generic')]),
      D.Forms.Button(
        { attrs: { 'data-m-gkey': 'retry', class: 'btn-primary' } },
        [t('btn.retry')]
      )
    ]);
  }

  /**
   * Render top header
   */
  function renderHeader(db) {
    var activeUser = getActiveUser(db);
    var notifCount = (db.data.notifications || []).filter(function(entry) {
      return entry && entry.status !== 'read';
    }).length;
    return D.Containers.Header({ attrs: { class: 'app-header' } }, [
      D.Containers.Div({ attrs: { class: 'brand' } }, [
        D.Text.Span({ attrs: { class: 'brand-title' } }, [t('app.name')]),
        D.Text.Span({ attrs: { class: 'brand-subtitle' } }, [t('app.tagline')])
      ]),
      D.Containers.Div({ attrs: { class: 'header-actions' } }, [
        D.Forms.Button(
          {
            attrs: {
              'data-m-gkey': 'toggle-theme',
              class: 'icon-btn',
              title: t('settings.theme.toggle')
            }
          },
          [db.env.theme === 'dark' ? '☀️' : '🌙']
        ),
        D.Forms.Button(
          {
            attrs: {
              'data-m-gkey': 'toggle-lang',
              class: 'icon-btn',
              title: t('settings.language.toggle')
            }
          },
          [db.env.lang === 'ar' ? t('settings.language.code.en') : t('settings.language.code.ar')]
        ),
        D.Forms.Button(
          {
            attrs: {
              'data-m-gkey': 'open-notifications',
              class: 'icon-btn',
              title: t('nav.notifications', 'الإشعارات')
            }
          },
          [notifCount > 0 ? ('🔔 ' + notifCount) : '🔔']
        ),
        D.Forms.Button(
          {
            attrs: {
              'data-m-gkey': activeUser ? 'auth-logout' : 'auth-open',
              class: activeUser ? 'hero-ghost' : 'hero-cta small',
              title: activeUser ? t('auth.logout', 'تسجيل الخروج') : t('auth.login', 'تسجيل الدخول')
            }
          },
          [activeUser ? t('auth.logout', 'تسجيل الخروج') : t('auth.login', 'تسجيل الدخول')]
        )
      ])
    ]);
  }

  function renderComposer(db) {
    var composer = db.state.composer || initialDatabase.state.composer;
    var activeUser = getActiveUser(db);
    var userName = resolveUserName(activeUser);
    var avatar = (activeUser && activeUser.avatar_url) || 'https://i.pravatar.cc/120?img=12';
    if (!activeUser) {
      return D.Containers.Div({ attrs: { class: 'composer-card locked' } }, [
        D.Text.H3({}, [t('composer.locked.title', 'ابدأ بمشاركة أعمالك')]),
        D.Text.P({ attrs: { class: 'composer-meta' } }, [
          t('composer.locked.body', 'سجّل الدخول أو أنشئ حساباً جديداً لتتمكن من نشر الإعلانات والريلز.')
        ]),
        D.Forms.Button({
          attrs: { class: 'hero-cta', 'data-m-gkey': 'auth-open' }
        }, [t('auth.login', 'تسجيل الدخول')]),
        D.Forms.Button({
          attrs: { class: 'chip ghost', 'data-m-gkey': 'open-register' }
        }, [t('auth.register', 'إنشاء حساب')])
      ]);
    }
    if (!composer.open) {
      return D.Containers.Div({ attrs: { class: 'composer-card collapsed' } }, [
        D.Media.Img({ attrs: { class: 'composer-avatar', src: avatar, alt: userName } }, []),
        D.Forms.Button({
          attrs: { class: 'composer-trigger', 'data-m-gkey': 'composer-open' }
        }, [t('composer.start')])
      ]);
    }

    var mediaModeOptions = [
      { value: 'plain', label: t('composer.media.plain', 'منشور نصي / صور') },
      { value: 'reel', label: t('composer.media.reel', 'ريل فيديو (حد أقصى 30 ثانية)') }
    ];
    var attachmentOptions = [
      { value: 'classified', label: t('composer.type.classified', 'إعلان مستعمل') },
      { value: 'product', label: t('composer.type.product') },
      { value: 'service', label: t('composer.type.service') },
      { value: 'wiki', label: t('composer.type.article') },
      { value: 'ad', label: t('composer.type.ad', 'إعلان ممول') },
      { value: 'none', label: t('composer.attachment.none', 'بدون مرفق') }
    ];
    var requiresTarget = ['product', 'service', 'wiki'].indexOf(composer.attachmentKind) !== -1;
    var attachments = requiresTarget ? getAttachmentOptions(db, composer.attachmentKind) : [];
    var showTarget = requiresTarget;
    var isClassified = composer.attachmentKind === 'classified';
    var composerCategories = getComposerCategoryGroupsByType(db, composer.attachmentKind);
    var showAdLink = composer.attachmentKind === 'ad';

    return D.Containers.Div({ attrs: { class: 'composer-card expanded' } }, [
      D.Containers.Div({ attrs: { class: 'composer-header' } }, [
        D.Media.Img({ attrs: { class: 'composer-avatar', src: avatar, alt: userName } }, []),
        D.Containers.Div({ attrs: { class: 'composer-user' } }, [
          D.Text.Span({ attrs: { class: 'composer-user-name' } }, [userName]),
          D.Text.Span({ attrs: { class: 'composer-meta' } }, [t('composer.visible.public')])
        ]),
        D.Forms.Button({
          attrs: { class: 'composer-close', 'data-m-gkey': 'composer-close' }
        }, ['✕'])
      ]),
      D.Inputs.Select({
        attrs: { class: 'composer-select', 'data-m-gkey': 'composer-media-mode', value: composer.mediaMode || 'plain' }
      }, mediaModeOptions.map(function(option) {
        return D.Inputs.Option({
          attrs: { value: option.value, selected: composer.mediaMode === option.value }
        }, [option.label]);
      })),
      D.Inputs.Select({
        attrs: { class: 'composer-select', 'data-m-gkey': 'composer-attachment', value: composer.attachmentKind || 'none' }
      }, attachmentOptions.map(function(option) {
        return D.Inputs.Option({
          attrs: { value: option.value, selected: composer.attachmentKind === option.value }
        }, [option.label]);
      })),
      composer.mediaMode === 'reel'
        ? D.Text.Small({ attrs: { class: 'composer-hint' } }, [t('composer.reel.hint', 'يتم قبول فيديو رأسي حتى 30 ثانية، وسيتم ضغطه تلقائياً.')])
        : null,
      isClassified
        ? D.Containers.Div({ attrs: { class: 'composer-form-grid' } }, [
            D.Inputs.Input({
              attrs: {
                type: 'text',
                class: 'composer-input',
                placeholder: t('composer.classified.title', 'عنوان الإعلان'),
                value: composer.classifiedTitle || '',
                'data-m-gkey': 'composer-classified-title'
              }
            }, []),
            D.Inputs.Input({
              attrs: {
                type: 'number',
                class: 'composer-input',
                placeholder: t('composer.classified.price', 'السعر (اختياري)'),
                value: composer.classifiedPrice || '',
                'data-m-gkey': 'composer-classified-price'
              }
            }, []),
            D.Inputs.Input({
              attrs: {
                type: 'tel',
                class: 'composer-input',
                placeholder: t('composer.classified.phone', 'هاتف التواصل'),
                value: composer.contactPhone || '',
                'data-m-gkey': 'composer-classified-phone'
              }
            }, [])
          ].filter(Boolean))
        : null,
      composerCategories.length
        ? D.Containers.Div({ attrs: { class: 'composer-form-grid' } }, [
            D.Inputs.Select({
              attrs: {
                class: 'composer-select',
                'data-m-gkey': 'composer-category',
                value: composer.categoryId || ''
              }
            }, [
              D.Inputs.Option({ attrs: { value: '' } }, [t('composer.select.category', 'اختر التصنيف الرئيسي')])
            ].concat(composerCategories.map(function(group) {
              return D.Inputs.Option({ attrs: { value: group.id } }, [group.label]);
            }))),
            (function() {
              var activeGroup = composerCategories.find(function(group) {
                return group.id === composer.categoryId;
              });
              if (!activeGroup || !activeGroup.children.length) return null;
              return D.Inputs.Select({
                attrs: {
                  class: 'composer-select',
                  'data-m-gkey': 'composer-subcategory',
                  value: composer.subcategoryId || ''
                }
              }, [
                D.Inputs.Option({ attrs: { value: '' } }, [t('composer.select.subcategory', 'اختر التصنيف الفرعي')])
              ].concat(activeGroup.children.map(function(child) {
                return D.Inputs.Option({ attrs: { value: child.id } }, [child.label]);
              })));
            })()
          ].filter(Boolean))
        : null,
      showTarget && !isClassified
        ? renderComposerAttachmentSelect(db, composer, attachments)
        : null,
      showAdLink
        ? D.Inputs.Input({
            attrs: {
              type: 'url',
              class: 'composer-input',
              placeholder: t('composer.ad.link', 'رابط الصفحة أو المتجر'),
              value: composer.linkUrl || '',
              'data-m-gkey': 'composer-link-url'
            }
          }, [])
        : null,
      isClassified
        ? (function() {
            var hasBasics = composer.classifiedTitle || composer.classifiedPrice || composer.contactPhone;
            if (!hasBasics) return null;
            return D.Containers.Div({ attrs: { class: 'composer-target-preview classified-preview' } }, [
              D.Containers.Div({ attrs: { class: 'preview-copy' } }, [
                composer.classifiedTitle
                  ? D.Text.Span({ attrs: { class: 'preview-title' } }, [composer.classifiedTitle])
                  : null,
                composer.classifiedPrice
                  ? D.Text.Small({ attrs: { class: 'preview-meta' } }, [formatCurrencyValue(composer.classifiedPrice, t('currency.egp'))])
                  : null,
                composer.contactPhone
                  ? D.Text.Small({ attrs: { class: 'preview-meta' } }, [composer.contactPhone])
                  : null
              ].filter(Boolean))
            ]);
          })()
        : null,
      (function() {
        var uploadLabel = composer.mediaMode === 'reel'
          ? t('composer.media.upload.reel', 'رفع فيديو')
          : t('composer.media.upload', 'رفع صور');
        var allowPicker = composer.mediaMode === 'reel' ||
          composer.mediaMode === 'plain' ||
          composer.attachmentKind === 'classified' ||
          composer.attachmentKind === 'ad';
        if (!allowPicker) return null;
        return D.Containers.Div({ attrs: { class: 'composer-media-row' } }, [
          D.Inputs.Input({
            attrs: {
              id: COMPOSER_MEDIA_INPUT_ID,
              type: 'file',
              class: 'composer-media-input',
              multiple: composer.mediaMode === 'reel' ? null : 'multiple',
              accept: composer.mediaMode === 'reel' ? 'video/*' : 'image/*',
              'data-m-gkey': 'composer-media-file',
              style: 'display:none;'
            }
          }, []),
          D.Forms.Button({
            attrs: {
              class: 'chip',
              'data-m-gkey': 'composer-media-pick',
              disabled: composer.uploadingMedia ? 'disabled' : null
            }
          }, [composer.uploadingMedia ? t('composer.media.uploading', 'جارٍ رفع الوسائط...') : uploadLabel]),
          composer.uploadError
            ? D.Text.Span({ attrs: { class: 'composer-error' } }, [composer.uploadError])
            : null
        ]);
      })(),
      composer.mediaMode === 'reel' && composer.reelDuration
        ? D.Text.Small({ attrs: { class: 'composer-hint' } }, [
            t('composer.reel.durationLabel', 'المدة الحالية: ') + Math.round(composer.reelDuration) + 's'
          ])
        : null,
      composer.mediaList && composer.mediaList.length
        ? D.Containers.Div({ attrs: { class: 'composer-media-list' } }, [
            composer.mediaList.map(function(url) {
              return D.Containers.Div({ attrs: { class: 'composer-media-item', key: url } }, [
                composer.mediaMode === 'reel'
                  ? D.Media.Video({ attrs: { src: url, class: 'composer-media-thumb', controls: true, playsinline: 'playsinline' } }, [])
                  : D.Media.Img({ attrs: { src: url, alt: 'media', class: 'composer-media-thumb' } }, []),
                D.Forms.Button({
                  attrs: {
                    class: 'composer-media-remove',
                    'data-m-gkey': 'composer-media-remove',
                    'data-url': url
                  }
                }, ['✕'])
              ]);
            })
          ])
        : null,
      D.Inputs.Textarea({
        attrs: {
          class: 'composer-textarea',
          placeholder: t('composer.placeholder'),
          value: composer.text || '',
          'data-m-gkey': 'composer-text'
        }
      }, []),
      composer.error
        ? D.Text.P({ attrs: { class: 'composer-error' } }, [composer.error])
        : null,
      D.Containers.Div({ attrs: { class: 'composer-actions' } }, [
        D.Forms.Button({
          attrs: {
            class: 'hero-cta',
            'data-m-gkey': 'composer-submit',
            disabled: composer.posting ? 'disabled' : null
          }
        }, [composer.posting ? t('composer.posting') : t('composer.publish')]),
        D.Forms.Button({
          attrs: { class: 'hero-ghost', 'data-m-gkey': 'composer-close' }
        }, ['✕'])
      ])
    ]);
  }

  function renderHero(db) {
    return D.Containers.Div({ attrs: { class: 'hero-card' } }, [
      D.Text.Span({ attrs: { class: 'hero-badge' } }, ['⚡️ ', t('home.hero.badge')]),
      D.Text.H2({ attrs: { class: 'hero-title' } }, [
        t('home.hero.title')
      ]),
      D.Text.P({ attrs: { class: 'hero-subtitle' } }, [
        t('home.hero.subtitle')
      ]),
      D.Containers.Div({ attrs: { class: 'hero-actions' } }, [
        D.Forms.Button({
          attrs: { class: 'hero-cta', 'data-m-gkey': 'nav-commerce' }
        }, [t('home.action.explore')]),
        D.Forms.Button({
          attrs: { class: 'hero-ghost', 'data-m-gkey': 'nav-classifieds' }
        }, [t('nav.classifieds', 'إعلان مستعمل')])
      ])
    ]);
  }

  function getOnboardingTasks(db) {
    var user = getActiveUser(db);
    var completed = (db.state.onboarding && db.state.onboarding.completed) || {};
    var userPosts = (db.data.posts || []).filter(function(post) { return user && post.user_id === user.user_id; });
    var hasAttachmentShare = userPosts.some(function(post) {
      return post && post.attachment_kind && post.attachment_kind !== 'none';
    });
    return [
      {
        key: 'avatar',
        title: t('onboarding.avatar', 'أضف صورة شخصية'),
        hint: t('onboarding.avatar.hint', 'يرفع الثقة مع المشترين'),
        done: Boolean((user && user.avatar_url) || completed.avatar)
      },
      {
        key: 'bio',
        title: t('onboarding.bio', 'أكمل السيرة الذاتية'),
        hint: t('onboarding.bio.hint', 'عرّف بنفسك أو نشاطك التجاري'),
        done: Boolean((user && getLocalizedField(user, 'bio', '')) || completed.bio)
      },
      {
        key: 'firstPost',
        title: t('onboarding.firstPost', 'انشر أول بوست'),
        hint: t('onboarding.firstPost.hint', 'شارك إعلان، منتج، خدمة أو مقال'),
        done: Boolean(userPosts.length || completed.firstPost)
      },
      {
        key: 'attachment',
        title: t('onboarding.attachment', 'جرّب إضافة مرفق'),
        hint: t('onboarding.attachment.hint', 'أضف إعلان مستعمل أو منتج/خدمة'),
        done: Boolean(hasAttachmentShare || completed.attachment)
      }
    ];
  }

  function renderOnboardingCard(db) {
    var user = getActiveUser(db);
    var onboarding = db.state.onboarding || initialDatabase.state.onboarding;
    if (!user || onboarding.dismissed) return null;
    var tasks = getOnboardingTasks(db);
    var remaining = tasks.filter(function(task) { return !task.done; });
    if (!remaining.length) return null;
    var progress = Math.round(((tasks.length - remaining.length) / tasks.length) * 100);

    return D.Containers.Div({ attrs: { class: 'section-card onboarding-card' } }, [
      D.Containers.Div({ attrs: { class: 'onboarding-head' } }, [
        D.Text.H4({}, [t('onboarding.title', 'ابدأ رحلتك على مستعمل حواء')]),
        D.Forms.Button({ attrs: { class: 'chip ghost', 'data-m-gkey': 'onboarding-dismiss' } }, ['✕'])
      ]),
      D.Containers.Div({ attrs: { class: 'onboarding-progress' } }, [
        D.Containers.Div({ attrs: { class: 'onboarding-progress-fill', style: 'width:' + progress + '%;' } }, [])
      ]),
      D.Containers.Div({ attrs: { class: 'onboarding-tasks' } },
        tasks.map(function(task) {
          var done = task.done;
          return D.Containers.Div({ attrs: { class: 'onboarding-task' + (done ? ' done' : ''), key: task.key } }, [
            D.Text.Span({ attrs: { class: 'onboarding-check' } }, [done ? '✓' : '•']),
            D.Containers.Div({ attrs: { class: 'onboarding-copy' } }, [
              D.Text.Span({ attrs: { class: 'onboarding-title' } }, [task.title]),
              D.Text.Small({ attrs: { class: 'onboarding-hint' } }, [task.hint])
            ]),
            done
              ? null
              : D.Forms.Button({
                  attrs: {
                    class: 'chip primary',
                    'data-m-gkey': 'onboarding-complete',
                    'data-task': task.key
                  }
                }, [t('onboarding.action', 'تم')])
          ].filter(Boolean));
        })
      ),
      D.Containers.Div({ attrs: { class: 'onboarding-actions' } }, [
        D.Forms.Button({ attrs: { class: 'hero-cta', 'data-m-gkey': 'composer-open' } }, [t('composer.start')]),
        D.Forms.Button({ attrs: { class: 'hero-ghost', 'data-m-gkey': 'profile-edit-open' } }, [t('profile.edit', 'تعديل الملف')])
      ])
    ]);
  }

  function renderCategoryClusterRoot(db, node) {
    if (!node || !node.data) return null;
    var cat = node.data;
    var description = getCategoryDescription(cat);
    var children = (node.children || []).map(function(child) {
      return child.data;
    });
    return D.Containers.Div({ attrs: { class: 'category-cluster', key: cat.category_id } }, [
      D.Text.H4({ attrs: { class: 'cluster-title' } }, [getCategoryDisplayName(cat)]),
      description ? D.Text.Span({ attrs: { class: 'cluster-description' } }, [description]) : null,
      children.length
        ? D.Containers.Div({ attrs: { class: 'chips-row' } },
            renderCategoryChips(db, children, 'category', 'category-chip', { skipAll: true })
          )
        : null
    ].filter(Boolean));
  }

  function renderCategoryShowcase(db) {
    var configs = [
      { key: 'classified', title: 'categories.classifieds', fallback: 'مستعمل حواء', data: db.data.classifiedCategories || [] },
      { key: 'marketplace', title: 'categories.marketplace', fallback: 'متجر حواء', data: db.data.marketplaceCategories || [] },
      { key: 'service', title: 'categories.services', fallback: 'خدمات حواء', data: db.data.serviceCategories || [] }
    ];
    var columns = configs.map(function(cfg) {
      if (!cfg.data.length) return null;
      var roots = buildCategoryHierarchy(cfg.data);
      if (!roots.length) return null;
      return D.Containers.Div({ attrs: { class: 'category-tree-column', key: cfg.key } }, [
        D.Text.H4({ attrs: { class: 'category-tree-heading' } }, [t(cfg.title, cfg.fallback)]),
        roots.slice(0, 3).map(function(root) {
          return renderCategoryClusterRoot(db, root);
        }).filter(Boolean)
      ]);
    }).filter(Boolean);
    if (!columns.length) return null;
    return D.Containers.Div({ attrs: { class: 'section-card category-tree-card' } }, [
      renderSectionHeader('home.categories', null, 'home.categories.meta', null),
      D.Containers.Div({ attrs: { class: 'category-tree-grid' } }, columns)
    ]);
  }

  function renderNotice(db) {
    if (!db.state.notice) return null;
    return D.Containers.Div({ attrs: { class: 'notice-toast' } }, [db.state.notice]);
  }

  function renderMetricGrid(db) {
    var stats = [
      { value: String(db.data.products?.length || 0), label: t('home.stats.products') },
      { value: String(db.data.services?.length || 0), label: t('home.stats.services') },
      { value: String(db.data.users?.length || 0), label: t('home.stats.creators') }
    ];
    return D.Containers.Div({ attrs: { class: 'metric-grid' } }, stats.map(function(entry, index) {
      return D.Containers.Div({ attrs: { class: 'metric-card', key: 'metric-' + index } }, [
        D.Containers.Div({ attrs: { class: 'metric-value' } }, [entry.value]),
        D.Containers.Div({ attrs: { class: 'metric-label' } }, [entry.label])
      ]);
    }));
  }

  function renderQuickActions() {
    return D.Containers.Div({ attrs: { class: 'section-card quick-actions' } }, [
      D.Text.H4({}, [t('home.quickActions', 'الوصول السريع')]),
      D.Containers.Div({ attrs: { class: 'chips-row' } }, [
        D.Forms.Button({
          attrs: { class: 'chip primary', 'data-m-gkey': 'nav-commerce' }
        }, ['🛍️ ', t('nav.commerce', 'منتج / خدمة')]),
        D.Forms.Button({
          attrs: { class: 'chip primary', 'data-m-gkey': 'nav-classifieds' }
        }, ['📢 ', t('nav.classifieds', 'إعلان مستعمل')]),
        D.Forms.Button({
          attrs: { class: 'chip primary', 'data-m-gkey': 'nav-knowledge' }
        }, ['📚 ', t('nav.knowledge')])
      ])
    ]);
  }

  function renderSectionHeader(titleKey, titleFallback, metaKey, metaFallback) {
    var heading = t(titleKey, titleFallback || titleKey);
    var metaText = metaKey ? t(metaKey, metaFallback || '') : '';
    return D.Containers.Div({ attrs: { class: 'section-heading' } }, [
      D.Text.H3({}, [heading]),
      metaText
        ? D.Text.Span({ attrs: { class: 'section-meta' } }, [metaText])
        : D.Text.Span({ attrs: { class: 'section-meta' } }, [])
    ]);
  }

  function findById(rows, keyField, target) {
    if (!Array.isArray(rows)) return null;
    return rows.find(function(row) {
      return row && row[keyField] === target;
    }) || null;
  }

  function resolveAttachmentPreview(db, kind, targetId) {
    if (!db || !kind || !targetId) return null;
    if (kind === 'product') {
      return findById(db.data.products || [], 'product_id', targetId);
    }
    if (kind === 'service') {
      return findById(db.data.services || [], 'service_id', targetId);
    }
    if (kind === 'wiki') {
      return findById(db.data.articles || [], 'article_id', targetId);
    }
    if (kind === 'classified') {
      return findById(db.data.classifieds || [], 'id', targetId) || findById(db.data.classifieds || [], 'classified_id', targetId);
    }
    return null;
  }

  function getActiveUser(db) {
    var users = db.data.users || [];
    var activeId = db.state.activeUserId;
    if (!activeId) return null;
    return findById(users, 'user_id', activeId) || null;
  }

  function getAttachmentOptions(db, kind) {
    if (kind === 'product') {
      return (db.data.products || []).map(function(product) {
        var title = resolveProductTitle(product);
        var price = product.price != null ? formatCurrencyValue(product.price, product.currency) : '';
        var label = price ? title + ' · ' + price : title;
        return { value: product.product_id, label: label };
      });
    }
    if (kind === 'service') {
      return (db.data.services || []).map(function(service) {
        var title = getLocalizedField(service, 'title', t('services.default'));
        var city = resolveCityName(service) || '';
        var label = city ? title + ' · ' + city : title;
        return { value: service.service_id, label: label };
      });
    }
    if (kind === 'wiki') {
      return (db.data.articles || []).map(function(article) {
        return { value: article.article_id, label: getLocalizedField(article, 'title', t('knowledge.card.title')) };
      });
    }
    return [];
  }

  function applyComposerState(ctx, updates) {
    ctx.setState(function(db) {
      var currentComposer = db.state.composer || initialDatabase.state.composer;
      var nextComposer = typeof updates === 'function' ? updates(currentComposer) : Object.assign({}, currentComposer, updates);
      persistComposerDraft(nextComposer);
      return {
        env: db.env,
        meta: db.meta,
        state: Object.assign({}, db.state, { composer: nextComposer }),
        data: db.data
      };
    });
  }

  function getComposerState() {
    if (app && app.database && app.database.state && app.database.state.composer) {
      return app.database.state.composer;
    }
    return initialDatabase.state.composer;
  }

  function createComposerState(overrides) {
    var snapshot = JSON.parse(JSON.stringify(initialDatabase.state.composer));
    if (overrides && typeof overrides === 'object') {
      Object.assign(snapshot, overrides);
    }
    return snapshot;
  }

  function updateOnboardingState(ctx, updates) {
    ctx.setState(function(db) {
      var current = db.state.onboarding || initialDatabase.state.onboarding || {};
      var next = typeof updates === 'function' ? updates(current) : Object.assign({}, current, updates);
      persistOnboardingProgress(next);
      return {
        env: db.env,
        meta: db.meta,
        state: Object.assign({}, db.state, { onboarding: next }),
        data: db.data
      };
    });
  }

  function openAuthModal(step) {
    var mode = step || 'login';
    if (app) {
      app.setState(function(db) {
        var nextAuth = Object.assign({}, db.state.auth || initialDatabase.state.auth, {
          open: true,
          step: mode,
          error: null
        });
        return {
          env: db.env,
          meta: db.meta,
          state: Object.assign({}, db.state, { auth: nextAuth }),
          data: db.data
        };
      });
    } else {
      initialDatabase.state.auth = Object.assign({}, initialDatabase.state.auth, {
        open: true,
        step: mode,
        error: null
      });
    }
  }

  function closeAuthModal() {
    if (app) {
      app.setState(function(db) {
        var nextAuth = Object.assign({}, db.state.auth || initialDatabase.state.auth, {
          open: false,
          error: null,
          step: 'login',
          password: '',
          otp: ''
        });
        return {
          env: db.env,
          meta: db.meta,
          state: Object.assign({}, db.state, { auth: nextAuth }),
          data: db.data
        };
      });
    } else {
      initialDatabase.state.auth.open = false;
    }
  }

  function updateAuthState(updates) {
    if (app) {
      app.setState(function(db) {
        var currentAuth = db.state.auth || initialDatabase.state.auth;
        var nextAuth = typeof updates === 'function'
          ? updates(currentAuth)
          : Object.assign({}, currentAuth, updates);
        return {
          env: db.env,
          meta: db.meta,
          state: Object.assign({}, db.state, { auth: nextAuth }),
          data: db.data
        };
      });
    } else {
      var next = typeof updates === 'function'
        ? updates(initialDatabase.state.auth)
        : Object.assign({}, initialDatabase.state.auth, updates);
      initialDatabase.state.auth = next;
    }
  }

  function setPostOverlay(ctx, updates) {
    ctx.setState(function(db) {
      var currentOverlay = db.state.postOverlay || initialDatabase.state.postOverlay;
      var nextOverlay = typeof updates === 'function' ? updates(currentOverlay) : Object.assign({}, currentOverlay, updates);
      var nextState = Object.assign({}, db.state, { postOverlay: nextOverlay });
      if (nextOverlay && nextOverlay.open) {
        nextState.commentDraft = '';
      } else if (!nextOverlay || nextOverlay.open === false) {
        nextState.commentDraft = '';
      }
      return {
        env: db.env,
        meta: db.meta,
        state: nextState,
      data: db.data
    };
  });
}

  function setDetailOverlay(ctx, updates) {
    ctx.setState(function(db) {
      var currentOverlay = db.state.detailOverlay || initialDatabase.state.detailOverlay;
      var nextOverlay = typeof updates === 'function' ? updates(currentOverlay) : Object.assign({}, currentOverlay, updates);
      var nextState = Object.assign({}, db.state, { detailOverlay: nextOverlay });
      return {
        env: db.env,
        meta: db.meta,
        state: nextState,
        data: db.data
      };
    });
  }

  function showNotice(ctx, message) {
    ctx.setState(function(db) {
      return {
        env: db.env,
        meta: db.meta,
        state: Object.assign({}, db.state, { notice: message }),
        data: db.data
      };
    });
    setTimeout(function() {
      if (!app) return;
      app.setState(function(db) {
        if (!db.state.notice || db.state.notice !== message) return db;
        return {
          env: db.env,
          meta: db.meta,
          state: Object.assign({}, db.state, { notice: null }),
          data: db.data
        };
      });
    }, 2500);
  }

  function handleComposerSubmit(ctx) {
    var currentDb = app ? app.database : null;
    if (!currentDb) return;
    var composer = getComposerState();
    if (composer.posting) return;
    if (composer.attachmentKind === 'classified') {
      submitClassified(ctx, composer);
      return;
    }
    var user = getActiveUser(currentDb);
    if (!user) {
      applyComposerState(ctx, { error: t('composer.error.user') });
      return;
    }
    if (!realtime || !realtime.store || typeof realtime.store.insert !== 'function') {
      applyComposerState(ctx, { error: t('composer.error.offline'), posting: false });
      return;
    }
    var hasMedia = Array.isArray(composer.mediaList) && composer.mediaList.length > 0;
    var needsText = composer.mediaMode === 'plain' && composer.attachmentKind === 'none';
    if (needsText && (!composer.text || !composer.text.trim()) && !hasMedia) {
      applyComposerState(ctx, { error: t('composer.error.empty'), posting: false });
      return;
    }
    var requiresTarget = ['product', 'service', 'wiki'].indexOf(composer.attachmentKind) !== -1;
    if (requiresTarget && !composer.targetId) {
      applyComposerState(ctx, { error: t('composer.error.target'), posting: false });
      return;
    }
    if (composer.attachmentKind === 'ad') {
      if (!composer.linkUrl || !composer.linkUrl.trim()) {
        applyComposerState(ctx, { error: t('composer.ad.link.required', 'يرجى إضافة رابط الإعلان قبل النشر'), posting: false });
        return;
      }
    }
    if (composer.mediaMode === 'reel' && (!Array.isArray(composer.mediaList) || !composer.mediaList.length)) {
      applyComposerState(ctx, { error: t('composer.reel.required', 'يرجى رفع فيديو للريل قبل النشر'), posting: false });
      return;
    }
    applyComposerState(ctx, { posting: true, error: null });
    var lang = getCurrentLang();
    var now = new Date().toISOString();
    var postId = typeof realtime.store.uuid === 'function'
      ? realtime.store.uuid('post')
      : generateId('post');
    var record = {
      post_id: postId,
      user_id: user.user_id,
      media_mode: composer.mediaMode || 'plain',
      attachment_kind: composer.attachmentKind || 'none',
      visibility: 'public',
      is_pinned: false,
      likes_count: 0,
      comments_count: 0,
      shares_count: 0,
      views_count: 0,
      created_at: now,
      updated_at: now
    };
    if (composer.attachmentKind === 'product') {
      record.shared_product_id = composer.targetId;
    } else if (composer.attachmentKind === 'service') {
      record.shared_service_id = composer.targetId;
    } else if (composer.attachmentKind === 'wiki') {
      record.shared_article_id = composer.targetId;
    } else if (composer.attachmentKind === 'classified' && composer.targetId) {
      record.shared_classified_id = composer.targetId;
    }
    var mergedMedia = Array.isArray(composer.mediaList) ? composer.mediaList.slice() : [];
    if (composer.attachmentKind === 'ad') {
      record.link_url = composer.linkUrl.trim();
      record.link_image = mergedMedia.length ? mergedMedia[0] : null;
    } else {
      record.link_url = null;
      record.link_image = null;
    }
    if (composer.mediaMode === 'reel') {
      record.media_metadata = {
        duration: composer.reelDuration || null,
        aspect_ratio: '9:16',
        max_duration: 30
      };
    } else if (composer.attachmentKind === 'ad') {
      record.media_metadata = {
        og_image: mergedMedia[0] || null,
        og_title: composer.text ? composer.text.slice(0, 120) : null
      };
    } else {
      record.media_metadata = null;
    }
    if (mergedMedia.length) {
      record.media_urls = JSON.stringify(mergedMedia);
    }
    var langRecord = {
      id: postId + '_lang_' + lang,
      post_id: postId,
      lang: lang,
      content: composer.text || '',
      is_auto: false,
      created_at: now
    };
    Promise.all([
      realtime.store.insert('sbn_posts', record, { source: 'pwa-composer' }),
      realtime.store.insert('sbn_posts_lang', langRecord, { source: 'pwa-composer' })
    ])
      .then(function() {
        ctx.setState(function(db) {
          var resetComposer = createComposerState({ open: false });
          persistComposerDraft(resetComposer);
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { composer: resetComposer }),
            data: db.data
          };
        });
        showNotice(ctx, t('composer.success'));
      })
      .catch(function(error) {
        console.error('[SBN PWA] composer failed', error);
        applyComposerState(ctx, { posting: false, error: t('composer.error.failed') });
      });
  }

  function submitClassified(ctx, composer) {
    var origin = getApiOrigin();
    if (!origin) {
      applyComposerState(ctx, { error: t('composer.error.network') });
      return;
    }
    var db = app ? app.database : null;
    if (!db) return;
    var sellerId = db.state.activeUserId;
    if (!sellerId) {
      applyComposerState(ctx, { error: t('composer.error.user') });
      return;
    }
    var categoryId = composer.subcategoryId || composer.categoryId || '';
    if (!categoryId) {
      applyComposerState(ctx, { error: t('composer.classified.category.error', 'اختر التصنيف المناسب') });
      return;
    }
    if (!composer.classifiedTitle || !composer.classifiedTitle.trim()) {
      applyComposerState(ctx, { error: t('composer.classified.title.error', 'ادخل عنوان الإعلان') });
      return;
    }
    var phoneDigits = (composer.contactPhone || '').replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 6) {
      applyComposerState(ctx, { error: t('composer.classified.phone.error', 'أضف رقم هاتف صالح للتواصل') });
      return;
    }
    var images = Array.isArray(composer.mediaList) ? composer.mediaList.slice() : [];
    var payload = {
      seller_id: sellerId,
      category_id: categoryId,
      title: composer.classifiedTitle.trim(),
      description: composer.text || '',
      price: composer.classifiedPrice ? Number(composer.classifiedPrice) : null,
      currency: 'EGP',
      contact_phone: composer.contactPhone || '',
      images: images
    };
    applyComposerState(ctx, { posting: true, error: null });
    fetch(origin + '/api/classifieds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(response) {
        if (!response.ok) throw new Error('classified-create-failed');
        return response.json();
      })
      .then(function() {
        setTimeout(function() {
          refreshClassifiedsSnapshot(getCurrentLang());
        }, 0);
        applyComposerState(ctx, function() {
          var resetComposer = createComposerState({ open: false });
          persistComposerDraft(resetComposer);
          return resetComposer;
        });
        showNotice(ctx, t('composer.classified.success', 'تم إضافة الإعلان بنجاح'));
      })
      .catch(function(error) {
        debugLog('[SBN PWA][classified]', error);
        applyComposerState(ctx, { posting: false, error: t('composer.classified.error', 'تعذر إنشاء الإعلان') });
      });
  }

  function renderSocialFeed(db) {
    var posts = getSortedPosts(db);
    return D.Containers.Div({ attrs: { class: 'section-card' } }, [
      renderSectionHeader('home.feed', null, 'home.feed.meta', null),
      posts.length
        ? D.Containers.Div({ attrs: { class: 'feed-list' } }, posts.map(function(post) {
            return renderPostCard(db, post);
          }))
        : D.Text.P({}, [t('home.feed.empty')])
    ]);
  }

  function renderTrendingHashtags(db) {
    var tags = (db.data.hashtags || []).slice().sort(function(a, b) {
      return (b.usage_count || 0) - (a.usage_count || 0);
    }).slice(0, 6);
    if (!tags.length) return null;
    return D.Containers.Div({ attrs: { class: 'section-card' } }, [
      renderSectionHeader('home.hashtags', null, null, null),
      D.Containers.Div({ attrs: { class: 'chips-row' } },
        tags.map(function(tag) {
          return D.Containers.Div({ attrs: { class: 'chip' } }, [resolveHashtagLabel(tag)]);
        })
      )
    ]);
  }

  function renderAnchorElement(attrs, children) {
    if (D.Elements && typeof D.Elements.A === 'function') {
      return D.Elements.A({ attrs: attrs }, children);
    }
    var label = (children && children.length) ? children : [attrs && attrs.href ? attrs.href : ''];
    return D.Text.Span({ attrs: { class: 'link-fallback' } }, label);
  }

  function resolvePostPresentationLabel(post) {
    if (!post || typeof post !== 'object') {
      return t('post.type.plain');
    }
    var mediaMode = (post.media_mode || '').toLowerCase();
    var attachmentKind = (post.attachment_kind || '').toLowerCase();
    if (mediaMode === 'reel') {
      return t('post.type.reel', 'ريل فيديو');
    }
    if (attachmentKind === 'product') {
      return t('post.type.product_share', 'مشاركة منتج');
    }
    if (attachmentKind === 'service') {
      return t('post.type.service_share', 'مشاركة خدمة');
    }
    if (attachmentKind === 'wiki') {
      return t('post.type.article_share', 'مشاركة معرفة');
    }
    if (attachmentKind === 'classified') {
      return t('post.type.classified', 'إعلان مستعمل');
    }
    if (attachmentKind === 'ad') {
      return t('post.type.ad', 'إعلان ممول');
    }
    return t('post.type.plain', 'منشور');
  }

  function renderPostCard(db, post) {
    var users = db.data.users || [];
    var user = findById(users, 'user_id', post.user_id);
    var userName = resolveUserName(user);
    var avatar = (user && user.avatar_url) || 'https://i.pravatar.cc/120?img=60';
    var postText = getLocalizedField(post, 'content', '');
    var mediaList = toArray(post.media_urls);
    var mediaMeta = post.media_metadata;
    if (mediaMeta && typeof mediaMeta === 'string') {
      try {
        mediaMeta = JSON.parse(mediaMeta);
      } catch (_err) {
        mediaMeta = null;
      }
    }
    var attachment = renderPostAttachment(db, post);
    var mediaStrip = null;
    var isReel = (post.media_mode || '').toLowerCase() === 'reel';
    if (isReel && mediaList.length) {
      var reelPoster = mediaMeta && mediaMeta.thumbnail_url;
      mediaStrip = D.Media.Video({
        attrs: {
          class: 'feed-reel',
          src: mediaList[0],
          controls: true,
          loop: true,
          playsinline: 'playsinline',
          poster: reelPoster || null
        }
      }, []);
    } else if (mediaList.length) {
      mediaStrip = D.Containers.Div({ attrs: { class: 'feed-media' } }, mediaList.slice(0, 3).map(function(url, idx) {
        return D.Media.Img({ attrs: { src: url, class: 'media-thumb', key: post.post_id + '-media-' + idx } }, []);
      }));
    }
    return D.Containers.Div({
      attrs: {
        class: 'feed-card',
        key: post.post_id,
        'data-m-gkey': 'post-open',
        'data-post-id': post.post_id
      }
    }, [
      D.Containers.Div({ attrs: { class: 'feed-header' } }, [
        D.Media.Img({ attrs: { src: avatar, class: 'feed-avatar', alt: userName } }, []),
        D.Containers.Div({ attrs: { class: 'feed-user' } }, [
          D.Text.Span({ attrs: { class: 'feed-user-name' } }, [userName]),
          D.Text.Span({ attrs: { class: 'feed-user-meta' } }, [
            resolvePostPresentationLabel(post),
            ' · ',
            new Date(post.created_at).toLocaleDateString()
          ])
        ]),
        post.is_pinned
          ? D.Text.Span({ attrs: { class: 'chip' } }, [t('post.pinned')])
          : null
      ].filter(Boolean)),
      postText ? D.Text.P({ attrs: { class: 'feed-content' } }, [postText]) : null,
      attachment,
      mediaStrip,
      D.Containers.Div({ attrs: { class: 'feed-stats' } }, [
        D.Text.Span({}, ['👁️ ', String(post.views_count || 0)]),
        D.Text.Span({}, ['💬 ', String(post.comments_count || 0)]),
        D.Text.Span({}, ['❤️ ', String(post.likes_count || 0)]),
        D.Text.Span({}, ['🔁 ', String(post.shares_count || 0)])
      ])
    ]);
  }

  function renderPostAttachment(db, post) {
    if (!post) return null;
    var products = db.data.products || [];
    var services = db.data.services || [];
    var articles = db.data.articles || [];
    var classifieds = db.data.classifieds || [];
    var mediaMeta = post.media_metadata;
    if (mediaMeta && typeof mediaMeta === 'string') {
      try {
        mediaMeta = JSON.parse(mediaMeta);
      } catch (_err) {
        mediaMeta = null;
      }
    }
    var attachmentKind = (post.attachment_kind || '').toLowerCase();
    if (attachmentKind === 'product' && post.shared_product_id) {
      var product = findById(products, 'product_id', post.shared_product_id);
      if (product) return renderProductCard(db, product, { compact: true });
    }
    if (attachmentKind === 'service' && post.shared_service_id) {
      var service = findById(services, 'service_id', post.shared_service_id);
      if (service) return renderServiceCard(db, service);
    }
    if (attachmentKind === 'wiki' && post.shared_article_id) {
      var article = findById(articles, 'article_id', post.shared_article_id);
      if (article) {
        return renderArticleItem(db, article);
      }
    }
    if (attachmentKind === 'classified' && post.shared_classified_id) {
      var classified = findById(classifieds, 'id', post.shared_classified_id) || findById(classifieds, 'classified_id', post.shared_classified_id);
      if (classified) {
        return renderClassifiedCard(db, classified);
      }
    }
    if (attachmentKind === 'ad' && post.link_url) {
      var adTitle = mediaMeta && (mediaMeta.og_title || mediaMeta.title);
      var adImage = (mediaMeta && mediaMeta.og_image) || post.link_image || (mediaMeta && mediaMeta.thumbnail_url);
      var adDescription = mediaMeta && (mediaMeta.og_description || mediaMeta.description);
      return D.Containers.Div({ attrs: { class: 'feed-attachment' } }, [
        D.Text.Span({ attrs: { class: 'chip' } }, [t('post.type.ad', 'إعلان')]),
        adImage
          ? D.Media.Img({ attrs: { src: adImage, alt: adTitle || post.link_url, class: 'ad-preview-img' } }, [])
          : null,
        adTitle ? D.Text.H4({}, [adTitle]) : null,
        adDescription ? D.Text.P({}, [adDescription]) : null,
        D.Text.P({}, [
          renderAnchorElement({
            href: post.link_url,
            target: '_blank',
            rel: 'noopener noreferrer'
          }, [post.link_url])
        ]),
        renderAttachmentAction('ad', t('post.type.ad.visit', 'زيارة الإعلان'), '', { 'data-link': post.link_url })
      ]);
    }
    return null;
  }

  function bumpPostStat(postId, field) {
    if (!app || !postId) return;
    app.setState(function(db) {
      var posts = db.data.posts || [];
      var updated = false;
      var nextPosts = posts.map(function(post) {
        if (post && post.post_id === postId) {
          updated = true;
          var nextValue = (post[field] || 0) + 1;
          var clone = Object.assign({}, post);
          clone[field] = nextValue;
          return clone;
        }
        return post;
      });
      if (!updated) return db;
      return {
        env: db.env,
        meta: db.meta,
        state: db.state,
        data: Object.assign({}, db.data, { posts: nextPosts })
      };
    });
  }

  function renderCategoryChips(db, categories, field, gkey, options) {
    var selected = db.state.filters[field] || '';
    var opts = options || {};
    var chips = [];
    if (!opts.skipAll) {
      chips.push(D.Forms.Button({
        attrs: {
          class: 'chip' + (selected === '' ? ' chip-active' : ''),
          'data-m-gkey': gkey,
          'data-value': ''
        }
      }, [t('filter.all')]));
    }
    chips = chips.concat((categories || []).map(function(cat) {
      return D.Forms.Button({
        attrs: {
          class: 'chip' + (selected === cat.category_id ? ' chip-active' : ''),
          'data-m-gkey': gkey,
          'data-value': cat.category_id
        }
      }, [getLocalizedField(cat, 'name', cat.slug || '')]);
    }));
    return chips;
  }

  function formatCurrencyValue(amount, currency) {
    if (amount === undefined || amount === null || amount === '') return '';
    var cur = currency || t('currency.egp');
    return String(amount) + ' ' + cur;
  }

  function pickClassifiedImage(item) {
    var images = Array.isArray(item?.images) ? item.images : [];
    return images.length ? images[0] : 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600';
  }

  function renderClassifiedCard(db, item) {
    if (!item) return null;
    var classifiedId = item.id || item.classified_id;
    var priceLabel = item.price != null ? formatCurrencyValue(item.price, item.currency) : t('classifieds.price.ask', 'سعر عند التواصل');
    var expires = item.expires_at ? new Date(item.expires_at).toLocaleDateString() : '';
    return D.Containers.Div({ attrs: { class: 'classified-card', key: item.id } }, [
      D.Media.Img({ attrs: { src: pickClassifiedImage(item), alt: item.title || '', class: 'classified-cover' } }, []),
      D.Containers.Div({ attrs: { class: 'classified-body' } }, [
        D.Text.H4({ attrs: { class: 'classified-title' } }, [item.title || t('classifieds.untitled', 'إعلان بدون عنوان')]),
        D.Text.P({ attrs: { class: 'classified-meta' } }, [
          priceLabel,
          item.location_city ? ' · ' + item.location_city : ''
        ]),
        item.description
          ? D.Text.P({ attrs: { class: 'classified-description' } }, [item.description])
          : null,
        D.Containers.Div({ attrs: { class: 'classified-footer' } }, [
          expires ? D.Text.Span({ attrs: { class: 'chip' } }, [t('classifieds.expiry', 'ينتهي'), ': ', expires]) : null,
          item.contact_phone
            ? D.Text.Span({ attrs: { class: 'chip' } }, ['☎️ ', item.contact_phone])
            : null
        ].filter(Boolean)),
        renderAttachmentAction('classified', t('classifieds.cta.contact', 'تواصل الآن'), classifiedId, {
          'data-phone': item.contact_phone || ''
        })
      ])
    ]);
  }

  function renderClassifiedsSection(db) {
    var classifieds = db.data.classifieds || [];
    if (!classifieds.length) return null;
    return D.Containers.Div({ attrs: { class: 'section-card' } }, [
      renderSectionHeader('classifieds.section', 'مستعمل حواء', 'classifieds.section.meta', 'أحدث الإعلانات المبوبة'),
      D.Containers.Div({ attrs: { class: 'classified-grid' } },
        classifieds.slice(0, 6).map(function(item) {
          return renderClassifiedCard(db, item);
        })
      )
    ]);
  }

  function getComposerCategoryGroups(categories) {
    var hierarchy = buildCategoryHierarchy(categories || []);
    return hierarchy.map(function(node) {
      return {
        id: node.data.category_id,
        label: getCategoryDisplayName(node.data),
        children: (node.children || []).map(function(child) {
          return {
            id: child.data.category_id,
            label: getCategoryDisplayName(child.data)
          };
        })
      };
    });
  }

  function getComposerCategoryGroupsByType(db, kind) {
    var sourceKey = COMPOSER_CATEGORY_SOURCES[kind];
    if (!sourceKey) return [];
    return getComposerCategoryGroups(db.data[sourceKey] || []);
  }

  function renderComposerAttachmentSelect(db, composer, attachments) {
    var addGkey = null;
    var addLabel = '';
    if (composer.attachmentKind === 'product') {
      addGkey = 'composer-add-product';
      addLabel = t('composer.add.product', '＋ إضافة منتج');
    } else if (composer.attachmentKind === 'service') {
      addGkey = 'composer-add-service';
      addLabel = t('composer.add.service', '＋ إضافة خدمة');
    } else if (composer.attachmentKind === 'wiki') {
      addGkey = 'composer-add-article';
      addLabel = t('composer.add.article', '＋ إضافة معرفة');
    }
    if (!attachments.length) {
      return D.Containers.Div({ attrs: { class: 'composer-empty-target' } }, [
        D.Text.P({}, [t('composer.target.empty', 'لا توجد عناصر جاهزة للمشاركة بعد.')]),
        addGkey
          ? D.Forms.Button({
              attrs: { class: 'chip ghost', 'data-m-gkey': addGkey }
            }, [addLabel])
          : null
      ].filter(Boolean));
    }
    var selectedRecord = resolveAttachmentPreview(db, composer.attachmentKind, composer.targetId);
    var previewNode = null;
    if (selectedRecord) {
      var image = resolvePrimaryImage(selectedRecord);
      var title = getLocalizedField(selectedRecord, 'title', selectedRecord.title || selectedRecord.name || '');
      var meta = composer.attachmentKind === 'product'
        ? formatCurrencyValue(selectedRecord.price, selectedRecord.currency)
        : resolveCityName(selectedRecord) || '';
      previewNode = D.Containers.Div({ attrs: { class: 'composer-target-preview' } }, [
        D.Media.Img({ attrs: { class: 'preview-thumb', src: image, alt: title } }, []),
        D.Containers.Div({ attrs: { class: 'preview-copy' } }, [
          D.Text.Span({ attrs: { class: 'preview-title' } }, [title]),
          meta ? D.Text.Small({ attrs: { class: 'preview-meta' } }, [meta]) : null
        ].filter(Boolean)),
        D.Forms.Button({
          attrs: { class: 'composer-target-clear', 'data-m-gkey': 'composer-target-clear' }
        }, ['✕'])
      ]);
    }
    return D.Containers.Div({ attrs: { class: 'composer-form-grid' } }, [
      D.Inputs.Select({
        attrs: {
          class: 'composer-select',
          'data-m-gkey': 'composer-target',
          value: composer.targetId || ''
        }
      }, [
        D.Inputs.Option({ attrs: { value: '' } }, [t('composer.select.default')])
      ].concat(
        attachments.map(function(option) {
          return D.Inputs.Option({
            attrs: { value: option.value, selected: composer.targetId === option.value }
          }, [option.label]);
        })
      )),
      addGkey
        ? D.Forms.Button({
            attrs: {
              class: 'chip ghost',
              'data-m-gkey': addGkey
            }
          }, [addLabel])
        : null,
      previewNode
    ].filter(Boolean));
  }

  function renderAttachmentAction(kind, label, targetId, extra) {
    var attrs = {
      class: 'attachment-cta chip ghost',
      'data-m-gkey': 'attachment-action',
      'data-kind': kind || ''
    };
    if (targetId) {
      attrs['data-target-id'] = targetId;
    }
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function(key) {
        attrs[key] = extra[key];
      });
    }
    return D.Forms.Button({ attrs: attrs }, [label]);
  }

  /**
   * Render product card
   */
  function renderProductCard(db, product, options) {
    var title = resolveProductTitle(product);
    var imageSrc = resolvePrimaryImage(product);
    var city = resolveCityName(product) || t('product.location.unknown');
    var priceValue = product.price != null ? product.price : (product.price_min != null ? product.price_min : product.price_max);
    var priceText = priceValue != null ? String(priceValue) + ' ' + t('currency.egp') : t('product.price.request');
    var cardClass = 'product-card';
    if (options && options.compact) {
      cardClass += ' carousel-card';
    }
    return D.Containers.Div({
      attrs: {
        class: cardClass,
        key: product.product_id,
        'data-m-key': 'product-' + product.product_id
      }
    }, [
      D.Containers.Div({ attrs: { class: 'product-media' } }, [
        D.Media.Img({
          attrs: { src: imageSrc, alt: title }
        }, [])
      ]),
      D.Containers.Div({ attrs: { class: 'product-body' } }, [
        D.Containers.Div({ attrs: { class: 'product-price' } }, [priceText]),
        D.Containers.Div({ attrs: { class: 'product-title' } }, [title]),
        D.Containers.Div({ attrs: { class: 'product-meta' } }, [
          D.Text.Span({}, [
            product.condition
              ? t('product.condition.' + product.condition, product.condition)
              : t('product.condition.unknown')
          ]),
          D.Text.Span({}, [city])
        ]),
        renderAttachmentAction('product', t('product.view', 'عرض المنتج'), product.product_id)
      ])
    ]);
  }

  /**
   * Render home section
   */
  function renderTimeline(db) {
    var products = db.data.products || [];
    var services = db.data.services || [];
    var articles = getWikiArticles(db).slice(0, 3);
    var categoryShowcase = renderCategoryShowcase(db);
    var tab = db.state.homeTab || 'timeline';

    function renderHomeTabs() {
      var tabOptions = [
        { value: 'timeline', label: t('nav.timeline') },
        { value: 'classifieds', label: t('nav.classifieds', 'إعلان مستعمل') },
        { value: 'commerce', label: t('nav.commerce', 'منتج / خدمة') },
        { value: 'knowledge', label: t('nav.knowledge') }
      ];
      return D.Containers.Div({ attrs: { class: 'section-card tab-switcher' } }, [
        D.Containers.Div({ attrs: { class: 'tab-row' } }, tabOptions.map(function(entry) {
          var active = tab === entry.value;
          return D.Forms.Button({
            attrs: {
              class: 'tab-btn' + (active ? ' active' : ''),
              'data-m-gkey': 'home-tab',
              'data-value': entry.value
            }
          }, [entry.label]);
        }))
      ]);
    }

    var sections = [
      renderHero(db),
      renderQuickActions(),
      renderOnboardingCard(db),
      renderHomeTabs()
    ];

    if (tab === 'timeline') {
      sections = sections.concat([
        renderComposer(db),
        renderSocialFeed(db),
        renderClassifiedsSection(db),
        renderTrendingHashtags(db),
        renderMetricGrid(db),
        categoryShowcase,
        D.Containers.Div({ attrs: { class: 'section-card' } }, [
          renderSectionHeader('home.featured', null, 'home.featured.meta', null),
          products.length
            ? D.Containers.Div({ attrs: { class: 'carousel-track' } },
                products.slice(0, 5).map(function(product) {
                  return renderProductCard(db, product, { compact: true });
                })
              )
            : D.Text.P({}, [t('marketplace.empty')])
        ]),
        D.Containers.Div({ attrs: { class: 'section-card' } }, [
          renderSectionHeader('home.services', null, null, null),
          services.length
            ? services.slice(0, 4).map(function(service) {
                return renderServiceCard(db, service);
              })
            : D.Text.P({}, [t('services.empty')])
        ]),
        D.Containers.Div({ attrs: { class: 'section-card' } }, [
          renderSectionHeader('knowledge.title', null, null, null),
          articles.length
            ? articles.map(function(article) { return renderArticleItem(db, article); })
            : D.Text.P({}, [t('knowledge.empty')])
        ])
      ]);
    } else if (tab === 'classifieds') {
      sections = sections.concat([
        renderComposer(db),
        renderClassifiedsSection(db),
        renderTrendingHashtags(db),
        categoryShowcase
      ]);
    } else if (tab === 'commerce') {
      sections = sections.concat([
        renderComposer(db),
        renderMarketplace(db),
        renderServices(db),
        categoryShowcase
      ]);
    } else if (tab === 'knowledge') {
      sections = sections.concat([
        renderComposer(db),
        D.Containers.Div({ attrs: { class: 'section-card' } }, [
          renderSectionHeader('knowledge.title', null, null, null),
          articles.length
            ? articles.map(function(article) { return renderArticleItem(db, article); })
            : D.Text.P({}, [t('knowledge.empty')])
        ])
      ]);
    }

    return D.Containers.Div({ attrs: { class: 'app-section' } }, sections.filter(Boolean));
  }

  function renderClassifiedsPage(db) {
    var classifieds = db.data.classifieds || [];
    var rows = classifieds.length
      ? classifieds.map(function(item) { return renderClassifiedCard(db, item); })
      : [D.Text.P({}, [t('classifieds.empty', 'لا توجد إعلانات مستعملة حالياً')])];
    return D.Containers.Div({ attrs: { class: 'app-section' } }, [
      D.Containers.Div({ attrs: { class: 'section-card' } }, [
        renderSectionHeader('classifieds.section', 'مستعمل حواء', 'classifieds.section.meta', 'أحدث الإعلانات'),
        D.Containers.Div({ attrs: { class: 'classified-grid' } }, rows)
      ])
    ]);
  }

  function renderCommerce(db) {
    return D.Containers.Div({ attrs: { class: 'app-section' } }, [
      renderMarketplace(db),
      renderServices(db)
    ]);
  }

  /**
   * Render marketplace section
   */
  function renderMarketplace(db) {
    var products = getFilteredProducts(db);
    var categories = getLeafCategories(db.data.marketplaceCategories || [], { onlyLeaves: true, limit: 12 });

    return D.Containers.Div({ attrs: { class: 'section-card' } }, [
      renderSectionHeader('nav.marketplace', null, 'home.featured.meta', null),
      D.Inputs.Input({
        attrs: {
          type: 'text',
          placeholder: t('placeholder.search.marketplace'),
          'data-m-gkey': 'search-input',
          class: 'search-input',
          value: db.state.filters.search || ''
        }
      }, []),
      D.Forms.Button({
        attrs: {
          class: 'chip primary',
          'data-m-gkey': 'open-product-form'
        }
      }, [t('marketplace.add.product', '＋ إضافة منتج')]),
      D.Containers.Div({ attrs: { class: 'chips-row' } },
        renderCategoryChips(db, categories, 'category', 'category-chip')
      ),
      D.Containers.Div({ attrs: { class: 'chips-row' } }, [
        D.Forms.Button({
          attrs: {
            class: 'chip' + (db.state.filters.condition === '' ? ' chip-active' : ''),
            'data-m-gkey': 'condition-chip',
            'data-value': ''
          }
        }, [t('filter.all.conditions')]),
        D.Forms.Button({
          attrs: {
            class: 'chip' + (db.state.filters.condition === 'new' ? ' chip-active' : ''),
            'data-m-gkey': 'condition-chip',
            'data-value': 'new'
          }
        }, [t('product.condition.new')]),
        D.Forms.Button({
          attrs: {
            class: 'chip' + (db.state.filters.condition === 'used' ? ' chip-active' : ''),
            'data-m-gkey': 'condition-chip',
            'data-value': 'used'
          }
        }, [t('product.condition.used')])
      ]),
      products.length > 0
        ? D.Containers.Div({ attrs: { class: 'carousel-track' } },
            products.map(function(product) {
              return renderProductCard(db, product, { compact: true });
            })
          )
        : D.Text.P({}, [t('marketplace.empty')])
    ]);
  }

  /**
   * Render service card
   */
  function renderServiceCard(db, service) {
    var priceRange = formatPriceRange(service.price_min, service.price_max);
    var priceLabel = priceRange
      ? priceRange + ' ' + t('currency.egp')
      : (service.price ? String(service.price) + ' ' + t('currency.egp') : t('services.price.request'));
    var serviceCity = resolveCityName(service) || t('services.location.unknown');
    return D.Containers.Div({
      attrs: {
        class: 'service-card',
        key: service.service_id,
        'data-m-key': 'service-' + service.service_id
      }
    }, [
      D.Text.H4({ attrs: { class: 'service-title' } }, [getLocalizedField(service, 'title', t('services.default'))]),
      D.Text.P({ attrs: { class: 'service-description' } }, [getLocalizedField(service, 'description', '') || '']),
      D.Containers.Div({ attrs: { class: 'service-meta' } }, [
        D.Text.Span({ attrs: { class: 'service-price' } }, [priceLabel]),
        D.Text.Span({ attrs: { class: 'service-location' } }, [serviceCity])
      ]),
      renderAttachmentAction('service', t('services.cta.book', 'احجز الخدمة'), service.service_id)
    ]);
  }

  /**
   * Render services section
   */
  function renderServices(db) {
    var services = getFilteredServices(db);
    var categories = getLeafCategories(db.data.serviceCategories || [], { onlyLeaves: true, limit: 12 });

    return D.Containers.Div({ attrs: { class: 'section-card' } }, [
      renderSectionHeader('nav.services', null, null, null),
      D.Inputs.Input({
        attrs: {
          type: 'text',
          placeholder: t('placeholder.search.services'),
          'data-m-gkey': 'search-input',
          class: 'search-input',
          value: db.state.filters.search || ''
        }
      }, []),
      D.Forms.Button({
        attrs: {
          class: 'chip primary',
          'data-m-gkey': 'open-service-form'
        }
      }, [t('services.add', '＋ إضافة خدمة')]),
      D.Containers.Div({ attrs: { class: 'chips-row' } },
        renderCategoryChips(db, categories, 'category', 'category-chip')
      ),
      services.length > 0
        ? services.map(function(service) {
            return renderServiceCard(db, service);
          })
        : D.Text.P({}, [t('services.empty')])
    ]);
  }

  /**
   * Render article item
   */
  function renderArticleItem(db, article) {
    var excerpt = article.excerpt || article.summary || article.description || '';
    var views = article.views_count != null ? article.views_count : (article.view_count || 0);
    var cover = resolvePrimaryImage(article);
    return D.Containers.Div({
      attrs: {
        class: 'article-card',
        key: article.article_id,
        'data-m-key': 'article-' + article.article_id
      }
    }, [
      cover
        ? D.Media.Img({ attrs: { class: 'article-cover', src: cover, alt: getLocalizedField(article, 'title', '') } }, [])
        : null,
      D.Text.H4({ attrs: { class: 'article-title' } }, [getLocalizedField(article, 'title', t('knowledge.card.title'))]),
      D.Text.P({ attrs: { class: 'article-summary' } }, [getLocalizedField(article, 'excerpt', excerpt) || t('wiki.noSummary')]),
      D.Containers.Div({ attrs: { class: 'article-meta' } }, [
        D.Text.Span({}, [String(views) + ' ' + t('wiki.views')]),
        renderAttachmentAction('wiki', t('btn.read', 'اقرأ الآن'), article.article_id)
      ])
    ].filter(Boolean));
  }

  /**
   * Render knowledge section
   */
  function renderKnowledge(db) {
    var articles = getWikiArticles(db);

    return D.Containers.Div({ attrs: { class: 'section-card' } }, [
      renderSectionHeader('knowledge.title', null, null, null),
      articles.length > 0
        ? articles.map(function(article) { return renderArticleItem(db, article); })
        : D.Text.P({}, [t('knowledge.empty')])
    ]);
  }

  function renderProfile(db) {
    var user = getActiveUser(db);
    if (!user) {
      return D.Text.P({}, [t('profile.empty')]);
    }
    var avatar = user.avatar_url || 'https://i.pravatar.cc/180?img=47';
    var stats = [
      { label: t('profile.followers'), value: String(user.followers_count || 0) },
      { label: t('profile.following'), value: String(user.following_count || 0) },
      { label: t('profile.posts'), value: String(user.posts_count || 0) }
    ];
    var posts = (db.data.posts || []).filter(function(post) {
      return post && post.user_id === user.user_id;
    });

    return D.Containers.Div({ attrs: { class: 'app-section' } }, [
      D.Containers.Div({ attrs: { class: 'section-card profile-card' } }, [
        D.Media.Img({ attrs: { class: 'profile-avatar', src: avatar, alt: resolveUserName(user) } }, []),
        D.Text.H3({ attrs: { class: 'profile-name' } }, [resolveUserName(user)]),
        D.Text.P({ attrs: { class: 'profile-handle' } }, ['@' + (user.username || '')]),
        D.Text.P({ attrs: { class: 'profile-bio' } }, [
          getLocalizedField(user, 'bio', t('profile.bio.placeholder'))
        ]),
        D.Containers.Div({ attrs: { class: 'profile-stats' } }, stats.map(function(stat, index) {
          return D.Containers.Div({ attrs: { class: 'profile-stat', key: 'stat-' + index } }, [
            D.Text.Span({ attrs: { class: 'profile-stat-value' } }, [stat.value]),
            D.Text.Span({ attrs: { class: 'profile-stat-label' } }, [stat.label])
          ]);
        })),
        D.Containers.Div({ attrs: { class: 'profile-actions' } }, [
          D.Forms.Button({ attrs: { class: 'hero-cta', 'data-m-gkey': 'composer-open' } }, [t('profile.cta.compose')]),
          D.Forms.Button({ attrs: { class: 'hero-ghost', 'data-m-gkey': 'profile-edit-open' } }, [t('profile.edit', 'تعديل الملف')]),
          D.Forms.Button({ attrs: { class: 'chip ghost', 'data-m-gkey': 'profile-message' } }, [t('profile.cta.message')])
        ]),
        renderProfileSwitcher(db)
      ]),
      D.Containers.Div({ attrs: { class: 'section-card' } }, [
        renderSectionHeader('profile.timeline', null, null, null),
        posts.length
          ? posts.map(function(post) { return renderPostCard(db, post); })
          : D.Text.P({}, [t('profile.timeline.empty')])
      ])
    ]);
  }

  function renderProfileSwitcher(db) {
    var users = db.data.users || [];
    if (!users.length) return null;
    return D.Containers.Div({ attrs: { class: 'profile-switcher' } }, users.map(function(user) {
      var active = db.state.activeUserId === user.user_id;
      return D.Forms.Button({
        attrs: {
          class: 'profile-chip' + (active ? ' active' : ''),
          'data-m-gkey': 'profile-select',
          'data-user-id': user.user_id
        }
      }, [resolveUserName(user)]);
    }));
  }

  function renderPostOverlay(db) {
    var overlay = db.state.postOverlay;
    if (!overlay || !overlay.open) return null;
    var posts = db.data.posts || [];
    var post = findById(posts, 'post_id', overlay.postId);
    if (!post) return null;
    var user = findById(db.data.users || [], 'user_id', post.user_id);
    var userName = resolveUserName(user);
    var avatar = (user && user.avatar_url) || 'https://i.pravatar.cc/120?img=24';
    var comments = (db.data.comments || []).filter(function(comment) {
      return comment && comment.post_id === post.post_id;
    });
    var commentList = comments.length
      ? comments.map(function(comment) {
          var commenter = findById(db.data.users || [], 'user_id', comment.user_id);
          return D.Containers.Div({ attrs: { class: 'comment-row', key: comment.comment_id } }, [
            D.Text.Span({ attrs: { class: 'comment-author' } }, [resolveUserName(commenter)]),
            D.Text.Span({ attrs: { class: 'comment-text' } }, [getLocalizedField(comment, 'content', '')])
          ]);
        })
      : [D.Text.P({ attrs: { class: 'comment-empty' } }, [t('post.overlay.empty')])];
    var langContent = getLocalizedField(post, 'content', '');
    var attachment = renderPostAttachment(db, post);

    return D.Containers.Div({
      attrs: { class: 'post-overlay', 'data-m-gkey': 'post-close' }
    }, [
      D.Containers.Div({ attrs: { class: 'post-overlay-panel', 'data-m-gkey': 'post-overlay-inner' } }, [
        D.Containers.Div({ attrs: { class: 'feed-header' } }, [
          D.Media.Img({ attrs: { class: 'feed-avatar', src: avatar, alt: userName } }, []),
        D.Containers.Div({ attrs: { class: 'feed-user' } }, [
          D.Text.Span({ attrs: { class: 'feed-user-name' } }, [userName]),
          D.Text.Span({ attrs: { class: 'feed-user-meta' } }, [
            resolvePostPresentationLabel(post),
            ' · ',
            new Date(post.created_at).toLocaleString()
          ])
        ]),
          D.Forms.Button({ attrs: { class: 'composer-close', 'data-m-gkey': 'post-close' } }, ['✕'])
        ]),
        langContent
          ? D.Text.P({ attrs: { class: 'feed-content' } }, [langContent])
          : null,
        attachment,
        D.Containers.Div({ attrs: { class: 'feed-stats overlay-stats' } }, [
          D.Text.Span({}, ['👁️ ', String(post.views_count || 0)]),
          D.Text.Span({}, ['💬 ', String(post.comments_count || 0)]),
          D.Text.Span({}, ['❤️ ', String(post.likes_count || 0)]),
          D.Text.Span({}, ['🔁 ', String(post.shares_count || 0)])
        ]),
        D.Containers.Div({ attrs: { class: 'overlay-actions' } }, [
          D.Forms.Button({
            attrs: { class: 'chip', 'data-m-gkey': 'post-like', 'data-post-id': post.post_id }
          }, ['❤️ ', t('post.action.like')]),
          D.Forms.Button({
            attrs: { class: 'chip', 'data-m-gkey': 'post-share', 'data-post-id': post.post_id }
          }, ['🔁 ', t('post.action.share')]),
          D.Forms.Button({
            attrs: { class: 'chip', 'data-m-gkey': 'post-subscribe', 'data-post-id': post.post_id }
          }, ['🔔 ', t('post.action.subscribe')])
        ]),
        D.Text.H4({}, [t('post.overlay.comments')]),
        D.Containers.Div({ attrs: { class: 'overlay-comments' } }, commentList),
        (function() {
          var canComment = Boolean(getActiveUser(db));
          if (!canComment) {
            return D.Forms.Button({
              attrs: { class: 'hero-cta', 'data-m-gkey': 'auth-open' }
            }, [t('comment.login', 'سجّل الدخول للتعليق')]);
          }
          return D.Containers.Div({ attrs: { class: 'comment-form' } }, [
            D.Inputs.Textarea({
              attrs: {
                class: 'comment-input',
                placeholder: t('comment.placeholder', 'أضف تعليقك...'),
                value: db.state.commentDraft || '',
                'data-m-gkey': 'comment-input'
              }
            }, []),
            D.Forms.Button({
              attrs: { class: 'hero-cta', 'data-m-gkey': 'comment-submit', 'data-post-id': post.post_id }
            }, [t('comment.submit', 'إرسال')])
          ]);
        })()
      ])
    ]);
  }

  function renderDetailOverlay(db) {
    var overlay = db.state.detailOverlay;
    if (!overlay || !overlay.open) return null;
    var kind = overlay.kind;
    var target = resolveAttachmentPreview(db, kind, overlay.targetId);
    if (!target) return null;
    var gallery = toArray(target.images || target.media || target.gallery || target.media_urls);
    if (!gallery.length) {
      var primary = resolvePrimaryImage(target);
      if (primary) gallery = [primary];
    }
    var activeIndex = Math.min(Math.max(overlay.activeIndex || 0, 0), Math.max(gallery.length - 1, 0));
    var activeImage = gallery[activeIndex] || resolvePrimaryImage(target);
    var title = getLocalizedField(target, 'title', target.title || target.name || '');
    var price = target.price != null ? formatCurrencyValue(target.price, target.currency || t('currency.egp')) : (target.price_min != null || target.price_max != null) ? formatPriceRange(target.price_min, target.price_max) : '';
    var description = getLocalizedField(target, 'description', target.body || target.summary || '');
    var location = resolveCityName(target);
    var contactPhone = target.contact_phone || target.phone || target.contact || '';

    var galleryThumbs = gallery.slice(0, 6).map(function(url, idx) {
      var isActive = idx === activeIndex;
      return D.Forms.Button({
        attrs: {
          class: 'detail-thumb' + (isActive ? ' active' : ''),
          'data-m-gkey': 'detail-gallery-thumb',
          'data-index': idx
        }
      }, [
        D.Media.Img({ attrs: { src: url, alt: title } }, [])
      ]);
    });

    var headerBadge = kind === 'product'
      ? t('nav.commerce', 'منتج / خدمة')
      : kind === 'service'
        ? t('composer.type.service')
        : kind === 'wiki'
          ? t('composer.type.article')
          : t('composer.type.classified', 'إعلان مستعمل');

    var actionRow = [];
    if (kind === 'classified' && contactPhone) {
      actionRow.push(renderAttachmentAction('classified', t('classifieds.call', 'اتصل الآن'), '', { 'data-phone': contactPhone }));
    }
    actionRow.push(renderAttachmentAction(kind, t('attachment.share', 'مشاركة'), overlay.targetId));

    return D.Containers.Div({ attrs: { class: 'detail-overlay', 'data-m-gkey': 'detail-close' } }, [
      D.Containers.Div({ attrs: { class: 'detail-panel', 'data-m-gkey': 'detail-overlay-inner' } }, [
        D.Containers.Div({ attrs: { class: 'detail-header' } }, [
          D.Text.Span({ attrs: { class: 'chip' } }, [headerBadge]),
          D.Forms.Button({ attrs: { class: 'auth-close-btn', 'data-m-gkey': 'detail-close' } }, ['✕'])
        ]),
        D.Containers.Div({ attrs: { class: 'detail-media' } }, [
          activeImage ? D.Media.Img({ attrs: { src: activeImage, alt: title, class: 'detail-hero' } }, []) : null,
          galleryThumbs.length ? D.Containers.Div({ attrs: { class: 'detail-gallery' } }, galleryThumbs) : null
        ].filter(Boolean)),
        D.Containers.Div({ attrs: { class: 'detail-body' } }, [
          D.Text.H3({ attrs: { class: 'detail-title' } }, [title || headerBadge]),
          price ? D.Text.Span({ attrs: { class: 'detail-price' } }, [price]) : null,
          location ? D.Text.Span({ attrs: { class: 'detail-location' } }, [location]) : null,
          description ? D.Text.P({ attrs: { class: 'detail-description' } }, [description]) : null,
          actionRow.length ? D.Containers.Div({ attrs: { class: 'detail-actions' } }, actionRow) : null
        ].filter(Boolean))
      ])
    ]);
  }

  function renderProfileEditor(db) {
    var editor = db.state.profileEditor;
    var user = getActiveUser(db);
    if (!editor || !editor.open || !user) return null;
    return D.Containers.Div({ attrs: { class: 'auth-overlay', 'data-m-gkey': 'profile-edit-close' } }, [
      D.Containers.Div({ attrs: { class: 'auth-modal', 'data-m-gkey': 'profile-edit-modal' } }, [
        D.Text.H3({}, [t('profile.edit', 'تعديل الملف الشخصي')]),
        D.Text.P({ attrs: { class: 'composer-hint' } }, [t('profile.edit.hint', 'حسّن الثقة عبر صورة وسيرة واضحة')]),
        D.Inputs.Input({
          attrs: {
            type: 'text',
            class: 'composer-input',
            placeholder: t('profile.edit.name', 'الاسم الظاهر'),
            value: editor.fullName || '',
            'data-m-gkey': 'profile-edit-input',
            'data-field': 'fullName'
          }
        }, []),
        D.Inputs.Input({
          attrs: {
            type: 'url',
            class: 'composer-input',
            placeholder: t('profile.edit.avatar', 'رابط الصورة الشخصية'),
            value: editor.avatarUrl || '',
            'data-m-gkey': 'profile-edit-input',
            'data-field': 'avatarUrl'
          }
        }, []),
        D.Inputs.Textarea({
          attrs: {
            class: 'composer-textarea',
            placeholder: t('profile.edit.bio', 'نبذة عنك أو عن نشاطك'),
            value: editor.bio || '',
            'data-m-gkey': 'profile-edit-input',
            'data-field': 'bio'
          }
        }, []),
        D.Containers.Div({ attrs: { class: 'composer-actions' } }, [
          D.Forms.Button({ attrs: { class: 'hero-cta', 'data-m-gkey': 'profile-edit-save' } }, [t('profile.save', 'حفظ التعديلات')]),
          D.Forms.Button({ attrs: { class: 'hero-ghost', 'data-m-gkey': 'profile-edit-close' } }, ['✕'])
        ])
      ])
    ]);
  }

  function renderNotificationsPanel(db) {
    if (!db.state.notificationsOpen) return null;
    var notifications = db.data.notifications || [];
    return D.Containers.Div({ attrs: { class: 'section-card notification-panel' } }, [
      D.Containers.Div({ attrs: { class: 'panel-header' } }, [
        D.Text.H4({}, [t('nav.notifications', 'الإشعارات')]),
        D.Forms.Button({ attrs: { class: 'chip ghost', 'data-m-gkey': 'close-notifications' } }, ['✕'])
      ]),
      notifications.length
        ? D.Containers.Div({ attrs: { class: 'notification-list' } },
            notifications.slice(0, 5).map(function(item) {
              return D.Containers.Div({ attrs: { class: 'notification-item', key: item.notification_id || item.id } }, [
                D.Text.Span({ attrs: { class: 'notification-title' } }, [getLocalizedField(item, 'title', t('nav.notifications'))]),
                D.Text.P({ attrs: { class: 'notification-body' } }, [getLocalizedField(item, 'body', item.description || '')])
              ]);
            })
          )
        : D.Text.P({ attrs: { class: 'notification-empty' } }, [t('notifications.empty', 'لا توجد إشعارات حالياً')])
    ]);
  }

  function markNotificationsAsRead() {
    if (!app || !app.database) return;
    var db = app.database;
    var pending = (db.data.notifications || []).filter(function(item) {
      return item && item.status !== 'read';
    });
    if (!pending.length) return;
    var updated = (db.data.notifications || []).map(function(item) {
      if (!item) return item;
      if (item.status === 'read') return item;
      var clone = Object.assign({}, item, { status: 'read' });
      return clone;
    });
    app.setState(function(prev) {
      return {
        env: prev.env,
        meta: prev.meta,
        state: prev.state,
        data: Object.assign({}, prev.data, { notifications: updated })
      };
    });
    if (realtime && realtime.store && typeof realtime.store.merge === 'function') {
      pending.forEach(function(item) {
        var id = item.notification_id || item.id;
        if (!id) return;
        realtime.store
          .merge('sbn_notifications', { notification_id: id, status: 'read' }, { source: 'pwa-notifications' })
          .catch(function(error) {
            console.warn('[SBN PWA] failed to mark notification read', error);
          });
      });
    }
  }

  function renderAuthModal(db) {
   var auth = (db && db.state && db.state.auth) || initialDatabase.state.auth;
   if (!auth || !auth.open) return null;
   var step = auth.step || 'login';
   var title = t('auth.login.title', 'مرحبا بك');
   var subtitle = t('auth.login.subtitle', 'سجّل دخولك للمتابعة');
   var fields = [];
  var demoHint = null;
   if (step === 'register') {
     title = t('auth.register.title', 'إنشاء حساب جديد');
     subtitle = t('auth.register.subtitle', 'شارك أعمالك وخدماتك فوراً');
     fields = [
       { name: 'fullName', type: 'text', label: t('auth.fullName', 'الاسم الكامل'), value: auth.fullName || '' },
       { name: 'email', type: 'email', label: t('auth.email', 'البريد الإلكتروني'), value: auth.email || '' },
       { name: 'password', type: 'password', label: t('auth.password', 'كلمة المرور'), value: auth.password || '' }
     ];
   } else if (step === 'otp') {
     title = t('auth.otp.title', 'أدخل رمز التحقق');
     subtitle = t('auth.otp.subtitle', 'استخدم الرمز 123456 لإكمال التفعيل');
     fields = [
       { name: 'otp', type: 'text', label: t('auth.otp', 'رمز التحقق'), value: auth.otp || '' }
     ];
   } else if (step === 'forgot') {
     title = t('auth.forgot.title', 'استعادة كلمة المرور');
     subtitle = t('auth.forgot.subtitle', 'سوف نرسل لك رمز تفعيل لتغيير كلمة المرور');
     fields = [
       { name: 'email', type: 'email', label: t('auth.email', 'البريد الإلكتروني'), value: auth.email || '' }
     ];
   } else {
     fields = [
       { name: 'email', type: 'email', label: t('auth.email', 'البريد الإلكتروني'), value: auth.email || '' },
       { name: 'password', type: 'password', label: t('auth.password', 'كلمة المرور'), value: auth.password || '' }
     ];
     demoHint = D.Text.Small({ attrs: { class: 'auth-note' } }, [
       t('auth.demo.hint', 'بيانات العرض: demo@mostamal.eg / demo123')
     ]);
   }
  var autocompleteMap = {
    email: 'email',
    password: step === 'login' ? 'current-password' : 'new-password',
    fullName: 'name',
    otp: 'one-time-code'
  };
  var fieldElements = fields.map(function(field) {
    var autocomplete = autocompleteMap[field.name] || (field.type === 'password' ? 'current-password' : 'off');
    return D.Inputs.Input({
      attrs: {
        type: field.type,
        value: field.value,
        placeholder: field.label,
        class: 'auth-input',
        name: field.name,
        autocomplete: autocomplete,
        'data-m-gkey': 'auth-input-' + field.name
      }
    }, []);
  });
   var primaryLabel = {
     login: t('auth.login', 'تسجيل الدخول'),
     register: t('auth.register', 'إنشاء حساب'),
     otp: t('auth.verify', 'تأكيد الرمز'),
     forgot: t('auth.send', 'إرسال الرمز')
   }[step] || t('auth.login', 'تسجيل الدخول');
   var links = [];
   if (step === 'login') {
     links = [
       D.Forms.Button({
         attrs: { class: 'link-btn', 'data-m-gkey': 'auth-switch', 'data-step': 'forgot' }
       }, [t('auth.forgot.link', 'نسيت كلمة المرور؟')]),
       D.Forms.Button({
         attrs: { class: 'link-btn', 'data-m-gkey': 'auth-switch', 'data-step': 'register' }
       }, [t('auth.register.link', 'مستخدم جديد؟ أنشئ حساباً')])
     ];
   } else if (step === 'register' || step === 'otp' || step === 'forgot') {
     links = [
       D.Forms.Button({
         attrs: { class: 'link-btn', 'data-m-gkey': 'auth-switch', 'data-step': 'login' }
       }, [t('auth.login.back', 'لديك حساب بالفعل؟')])
     ];
   }
   var errorNode = auth.error
     ? D.Text.P({ attrs: { class: 'auth-error' } }, [auth.error])
     : null;
  return D.Containers.Div({ attrs: { class: 'auth-overlay', 'data-m-gkey': 'auth-overlay' } }, [
    D.Containers.Div({ attrs: { class: 'auth-panel', 'data-m-gkey': 'auth-modal' } }, [
      D.Forms.Button({ attrs: { class: 'auth-close-btn', 'data-m-gkey': 'auth-close' } }, ['✕']),
      D.Text.H3({ attrs: { class: 'auth-title' } }, [title]),
      D.Text.P({ attrs: { class: 'auth-subtitle' } }, [subtitle]),
      demoHint,
      errorNode,
      D.Forms.Form({
        attrs: { class: 'auth-form', 'data-m-gkey': 'auth-submit', novalidate: 'novalidate' }
      }, [
        D.Containers.Div({ attrs: { class: 'auth-fields' } }, fieldElements),
        D.Forms.Button({
          attrs: { class: 'hero-cta', type: 'submit' }
        }, [primaryLabel]),
        D.Containers.Div({ attrs: { class: 'auth-links' } }, links.filter(Boolean))
      ])
    ])
  ]);
}


  /**
   * Render bottom navigation
   */
  function renderBottomNav(db) {
    var currentSection = db.state.currentSection;

    return D.Containers.Nav({ attrs: { class: 'bottom-nav' } }, [
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-profile',
          class: 'nav-item' + (currentSection === 'profile' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['👤']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.profile')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-classifieds',
          class: 'nav-item' + (currentSection === 'classifieds' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['📢']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.classifieds', 'إعلان مستعمل')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-commerce',
          class: 'nav-item' + (currentSection === 'commerce' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🛍️']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.commerce', 'منتج / خدمة')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-knowledge',
          class: 'nav-item' + (currentSection === 'knowledge' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['📚']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.knowledge')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-home',
          class: 'nav-item' + (currentSection === 'timeline' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🏠']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.timeline')])
      ])
    ]);
  }

  /**
   * Main body function
   */
  function renderBody(db) {
    if (db.state.loading) {
      return renderLoading(db);
    }

    if (db.state.error) {
      return renderError(db);
    }

    var currentSection = db.state.currentSection;
    var sectionView;

    switch (currentSection) {
      case 'commerce':
        sectionView = renderCommerce(db);
        break;
      case 'classifieds':
        sectionView = renderClassifiedsPage(db);
        break;
      case 'knowledge':
        sectionView = renderKnowledge(db);
        break;
      case 'profile':
        sectionView = renderProfile(db);
        break;
      case 'timeline':
      default:
        sectionView = renderTimeline(db);
    }

    return D.Containers.Div({ attrs: { class: 'screen-bg' } }, [
      D.Containers.Div({ attrs: { class: 'app-shell' } }, [
        renderPwaInstallBanner(db),
        renderNotice(db),
        renderHeader(db),
        renderNotificationsPanel(db),
        D.Containers.Main({ attrs: { class: 'app-main' } }, [sectionView]),
        renderBottomNav(db),
        renderDetailOverlay(db),
        renderPostOverlay(db),
        renderProfileEditor(db),
        renderAuthModal(db)
      ].filter(Boolean))
    ]);
  }

  // ================== EVENT HANDLERS (ORDERS) ==================
  var orders = {
    'nav.timeline': {
      on: ['click'],
      gkeys: ['nav-home'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'timeline' }),
            data: db.data
          };
        });
      }
    },

    'nav.commerce': {
      on: ['click'],
      gkeys: ['nav-commerce', 'nav-marketplace', 'nav-services'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'commerce' }),
            data: db.data
          };
        });
      }
    },

    'nav.classifieds': {
      on: ['click'],
      gkeys: ['nav-classifieds'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'classifieds' }),
            data: db.data
          };
        });
      }
    },

    'open.product.form': {
      on: ['click'],
      gkeys: ['open-product-form'],
      handler: function(event, ctx) {
        event.preventDefault();
        showNotice(ctx, t('marketplace.add.product.notice', 'انتقل للمتجر لإضافة منتج جديد ثم شاركه'));
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'commerce' }),
            data: db.data
          };
        });
      }
    },

    'attachment.action': {
      on: ['click'],
      gkeys: ['attachment-action'],
      handler: function(event, ctx) {
        event.preventDefault();
        event.stopPropagation();
        var target = event.currentTarget || event.target;
        if (!target) return;
        var kind = (target.getAttribute('data-kind') || '').toLowerCase();
        var targetId = target.getAttribute('data-target-id') || '';
        var link = target.getAttribute('data-link') || '';
        var phone = target.getAttribute('data-phone') || '';
        if (kind === 'product') {
          setDetailOverlay(ctx, { open: true, kind: 'product', targetId: targetId, activeIndex: 0 });
        } else if (kind === 'service') {
          setDetailOverlay(ctx, { open: true, kind: 'service', targetId: targetId, activeIndex: 0 });
        } else if (kind === 'wiki') {
          setDetailOverlay(ctx, { open: true, kind: 'wiki', targetId: targetId, activeIndex: 0 });
        } else if (kind === 'classified') {
          if (targetId) {
            setDetailOverlay(ctx, { open: true, kind: 'classified', targetId: targetId, activeIndex: 0 });
          } else if (phone) {
            try {
              global.open('tel:' + phone.replace(/[^0-9+]/g, ''), '_self');
            } catch (_err) {
              showNotice(ctx, phone);
            }
          } else {
            showNotice(ctx, t('classifieds.contact.empty', 'يمكنك التواصل من خلال التعليقات أو الرسائل.'));
          }
        } else if (kind === 'ad') {
          if (link) {
            try {
              global.open(link, '_blank', 'noopener');
            } catch (_err) {
              showNotice(ctx, link);
            }
          } else {
            showNotice(ctx, t('post.type.ad', 'إعلان ممول'));
          }
        }
      }
    },

    'detail.close': {
      on: ['click'],
      gkeys: ['detail-close'],
      handler: function(event, ctx) {
        event.preventDefault();
        setDetailOverlay(ctx, { open: false, targetId: null, kind: null, activeIndex: 0 });
      }
    },

    'detail.inner': {
      on: ['click'],
      gkeys: ['detail-overlay-inner'],
      handler: function(event) {
        event.stopPropagation();
      }
    },

    'detail.gallery.thumb': {
      on: ['click'],
      gkeys: ['detail-gallery-thumb'],
      handler: function(event, ctx) {
        var indexAttr = event.currentTarget && event.currentTarget.getAttribute('data-index');
        var nextIndex = indexAttr ? Number(indexAttr) : 0;
        setDetailOverlay(ctx, { activeIndex: nextIndex });
      }
    },

    'open.service.form': {
      on: ['click'],
      gkeys: ['open-service-form'],
      handler: function(event, ctx) {
        event.preventDefault();
        showNotice(ctx, t('services.add.notice', 'انتقل لقسم الخدمات لإضافة عرض جديد ثم شاركه هنا'));
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'commerce' }),
            data: db.data
          };
        });
      }
    },

    'nav.knowledge': {
      on: ['click'],
      gkeys: ['nav-knowledge'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'knowledge' }),
            data: db.data
          };
        });
      }
    },

    'nav.profile': {
      on: ['click'],
      gkeys: ['nav-profile'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'profile' }),
            data: db.data
          };
        });
      }
    },

    'home.tab': {
      on: ['click'],
      gkeys: ['home-tab'],
      handler: function(event, ctx) {
        var value = event.currentTarget && event.currentTarget.getAttribute('data-value');
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { homeTab: value || 'timeline' }),
            data: db.data
          };
        });
      }
    },
    'open-notifications': {
      on: ['click'],
      gkeys: ['open-notifications'],
      handler: function(event, ctx) {
        event.preventDefault();
        var shouldOpen = !(app && app.database && app.database.state && app.database.state.notificationsOpen);
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { notificationsOpen: !db.state.notificationsOpen }),
            data: db.data
          };
        });
        if (shouldOpen) {
          setTimeout(markNotificationsAsRead, 0);
        }
      }
    },
    'close-notifications': {
      on: ['click'],
      gkeys: ['close-notifications'],
      handler: function(event, ctx) {
        event.preventDefault();
        event.stopPropagation();
        ctx.setState(function(db) {
          if (!db.state.notificationsOpen) return db;
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { notificationsOpen: false }),
            data: db.data
          };
        });
      }
    },

    'auth.open': {
      on: ['click'],
      gkeys: ['auth-open'],
      handler: function(event) {
        event.preventDefault();
        openAuthModal('login');
      }
    },

    'open-register': {
      on: ['click'],
      gkeys: ['open-register'],
      handler: function(event) {
        event.preventDefault();
        openAuthModal('register');
      }
    },

    'auth.close': {
      on: ['click'],
      gkeys: ['auth-close'],
      handler: function(event) {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        closeAuthModal();
      }
    },

    'auth.overlay': {
      on: ['click'],
      gkeys: ['auth-overlay'],
      handler: function(event) {
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        if (event && event.target !== event.currentTarget) {
          return;
        }
        event.preventDefault();
        closeAuthModal();
      }
    },

    'auth.modal': {
      on: ['click', 'mousedown', 'touchstart'],
      gkeys: ['auth-modal'],
      handler: function(event) {
        event.stopPropagation();
      }
    },

    'auth.switch': {
      on: ['click'],
      gkeys: ['auth-switch'],
      handler: function(event) {
        event.preventDefault();
        var step = event.currentTarget && event.currentTarget.getAttribute('data-step');
        if (!step) return;
        updateAuthState(function(current) {
          return Object.assign({}, current, {
            step: step,
            error: null,
            otp: '',
            fullName: step === 'register' ? current.fullName : '',
            pendingUser: step === 'otp' ? current.pendingUser : null,
            password: step === 'login' ? '' : current.password
          });
        });
      }
    },

    'auth-input-email': {
      on: ['input'],
      gkeys: ['auth-input-email'],
      handler: function(event) {
        updateAuthState({ email: event.target.value });
      }
    },

    'auth-input-password': {
      on: ['input'],
      gkeys: ['auth-input-password'],
      handler: function(event) {
        var value = (event && event.target && event.target.value) || (event && event.currentTarget && event.currentTarget.value) || '';
        console.log('[SBN PWA][auth] password input', { length: value.length });
        updateAuthState({ password: value });
      }
    },

    'auth-input-fullName': {
      on: ['input'],
      gkeys: ['auth-input-fullName'],
      handler: function(event) {
        updateAuthState({ fullName: event.target.value });
      }
    },

    'auth-input-otp': {
      on: ['input'],
      gkeys: ['auth-input-otp'],
      handler: function(event) {
        updateAuthState({ otp: event.target.value });
      }
    },

    'auth.submit': {
      on: ['submit'],
      gkeys: ['auth-submit'],
      handler: function(event, ctx) {
        event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
        var db = app ? app.database : null;
        var auth = (db && db.state && db.state.auth) || initialDatabase.state.auth;
        var formEl = event && event.target;
        var step = auth.step || 'login';
        var email = (auth.email || '').trim().toLowerCase();
        var password = auth.password || '';
        if (!password && formEl && typeof formEl.querySelector === 'function') {
          var passwordInput = formEl.querySelector('input[name=\"password\"]');
          if (passwordInput && passwordInput.value) {
            password = passwordInput.value;
            updateAuthState({ password: password });
          }
        }
        if (step === 'login') {
          console.log('[SBN PWA][auth] login attempt', {
            email: email,
            matchesDemoEmail: email === DEMO_ACCOUNT.email,
            passwordMatch: password === DEMO_ACCOUNT.password,
            hasPassword: Boolean(password)
          });
          if (email === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password) {
            ctx.setState(function(prev) {
              var nextAuth = Object.assign({}, prev.state.auth, { open: false, error: null, password: '', otp: '' });
              return {
                env: prev.env,
                meta: prev.meta,
                state: Object.assign({}, prev.state, { activeUserId: DEMO_ACCOUNT.userId, auth: nextAuth }),
                data: prev.data
              };
            });
            persistSession({ userId: DEMO_ACCOUNT.userId, email: email });
            showNotice(ctx, t('auth.success.login', 'تم تسجيل الدخول بنجاح'));
          } else {
            updateAuthState({ error: t('auth.error.credentials', 'بيانات الدخول غير صحيحة') });
          }
          return;
        }
        if (step === 'register') {
          if (!auth.fullName || !auth.fullName.trim() || !email || !auth.password) {
            updateAuthState({ error: t('auth.error.fields', 'يرجى تعبئة جميع الحقول') });
            return;
          }
          var pendingUser = {
            user_id: generateId('usr'),
            full_name: auth.fullName.trim(),
            username: auth.fullName.trim().split(/\s+/).join('_'),
            email: email,
            avatar_url: 'https://i.pravatar.cc/120?img=28'
          };
          updateAuthState({ pendingUser: pendingUser, step: 'otp', error: null, otp: '' });
          showNotice(ctx, t('auth.otp.sent', 'تم إرسال رمز التفعيل (123456)'));
          return;
        }
        if (step === 'forgot') {
          if (!email) {
            updateAuthState({ error: t('auth.error.email', 'أدخل بريدك الإلكتروني') });
            return;
          }
          updateAuthState({ pendingUser: { user_id: DEMO_ACCOUNT.userId }, step: 'otp', error: null, otp: '' });
          showNotice(ctx, t('auth.otp.sent', 'تم إرسال رمز التفعيل (123456)'));
          return;
        }
        if (step === 'otp') {
          if ((auth.otp || '').trim() !== DEMO_ACCOUNT.otp) {
            updateAuthState({ error: t('auth.error.otp', 'رمز التحقق غير صحيح') });
            return;
          }
          var pendingUser = auth.pendingUser || { user_id: DEMO_ACCOUNT.userId, email: auth.email || DEMO_ACCOUNT.email };
          var resolvedUserId = pendingUser.user_id || DEMO_ACCOUNT.userId;
          ctx.setState(function(prev) {
            var pending = (prev.state.auth && prev.state.auth.pendingUser) || pendingUser;
            var nextAuth = Object.assign({}, prev.state.auth, { open: false, error: null, otp: '', password: '', pendingUser: null });
            var nextData = prev.data;
            var newUserId = pending && pending.user_id ? pending.user_id : DEMO_ACCOUNT.userId;
            if (pending) {
              var users = Array.isArray(prev.data.users) ? prev.data.users.slice() : [];
              if (!users.some(function(user) { return user && user.user_id === pending.user_id; })) {
                var newUser = {
                  user_id: pending.user_id,
                  username: pending.username || pending.full_name.replace(/\s+/g, '_').toLowerCase(),
                  full_name: pending.full_name,
                  email: pending.email,
                  avatar_url: pending.avatar_url || 'https://i.pravatar.cc/120?img=11',
                  followers_count: 0,
                  following_count: 0,
                  posts_count: 0,
                  status: 'active'
                };
                users.push(newUser);
                nextData = Object.assign({}, prev.data, { users: users });
              }
            }
            return {
              env: prev.env,
              meta: prev.meta,
              state: Object.assign({}, prev.state, { activeUserId: newUserId, auth: nextAuth }),
              data: nextData
            };
          });
          persistSession({ userId: resolvedUserId, email: pendingUser.email || auth.email || DEMO_ACCOUNT.email });
          showNotice(ctx, t('auth.success.register', 'تم التفعيل بنجاح'));
          return;
        }
      }
    },

    'auth.logout': {
      on: ['click'],
      gkeys: ['auth-logout'],
      handler: function(event, ctx) {
        event.preventDefault();
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { activeUserId: null, composer: createComposerState({ open: false }) }),
            data: db.data
          };
        });
        clearPersistedSession();
        showNotice(ctx, t('auth.logout.success', 'تم تسجيل الخروج'));
      }
    },

    'pwa-dismiss': {
      on: ['click'],
      gkeys: ['pwa-dismiss'],
      handler: function(event) {
        event.preventDefault();
        suppressPwaPromptForSession();
        setPwaPromptState(false);
      }
    },

    'toggle.theme': {
      on: ['click'],
      gkeys: ['toggle-theme'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          var newTheme = db.env.theme === 'light' ? 'dark' : 'light';
          var newEnv = Object.assign({}, db.env, { theme: newTheme });
          applyTheme(newTheme);
          persistPrefs(newEnv);
          return {
            env: newEnv,
            meta: db.meta,
            state: db.state,
            data: db.data
          };
        });
      }
    },

    'toggle.lang': {
      on: ['click'],
      gkeys: ['toggle-lang'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          var newLang = db.env.lang === 'ar' ? 'en' : 'ar';
          var newDir = newLang === 'ar' ? 'rtl' : 'ltr';
          var newEnv = Object.assign({}, db.env, { lang: newLang, dir: newDir });
          applyLang(newLang, newDir);
          persistPrefs(newEnv);
          return {
            env: newEnv,
            meta: db.meta,
            state: Object.assign({}, db.state, { loading: true, error: null }),
            data: db.data
          };
        });
        setTimeout(initRealtime, 0);
      }
    },

    'search.input': {
      on: ['input'],
      gkeys: ['search-input'],
      handler: function(event, ctx) {
        var searchValue = event.target.value;
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, {
              filters: Object.assign({}, db.state.filters, { search: searchValue })
            }),
            data: db.data
          };
        });
      }
    },

    'filter.category': {
      on: ['change'],
      gkeys: ['category-filter'],
      handler: function(event, ctx) {
        var categoryValue = event.target.value;
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, {
              filters: Object.assign({}, db.state.filters, { category: categoryValue })
            }),
            data: db.data
          };
        });
      }
    },

    'filter.category.chip': {
      on: ['click'],
      gkeys: ['category-chip'],
      handler: function(event, ctx) {
        var categoryValue = event.currentTarget && event.currentTarget.getAttribute('data-value') || '';
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, {
              filters: Object.assign({}, db.state.filters, { category: categoryValue })
            }),
            data: db.data
          };
        });
      }
    },
    'filter.condition': {
      on: ['change'],
      gkeys: ['condition-filter'],
      handler: function(event, ctx) {
        var conditionValue = event.target.value;
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, {
              filters: Object.assign({}, db.state.filters, { condition: conditionValue })
            }),
            data: db.data
          };
        });
      }
    },

    'filter.condition.chip': {
      on: ['click'],
      gkeys: ['condition-chip'],
      handler: function(event, ctx) {
        var conditionValue = event.currentTarget && event.currentTarget.getAttribute('data-value') || '';
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, {
              filters: Object.assign({}, db.state.filters, { condition: conditionValue })
            }),
            data: db.data
          };
        });
      }
    },
    'composer.open': {
      on: ['click'],
      gkeys: ['composer-open'],
      handler: function(event, ctx) {
        var db = app ? app.database : null;
        var user = db ? getActiveUser(db) : null;
        if (!user) {
          openAuthModal('login');
          return;
        }
        applyComposerState(ctx, function(current) {
          return Object.assign({}, current, { open: true, error: null });
        });
      }
    },
    'composer.close': {
      on: ['click'],
      gkeys: ['composer-close'],
      handler: function(event, ctx) {
        applyComposerState(ctx, function() {
          return createComposerState({ open: false });
        });
      }
    },
    'composer.text': {
      on: ['input'],
      gkeys: ['composer-text'],
      handler: function(event, ctx) {
        var value = event.target.value;
        applyComposerState(ctx, { text: value });
      }
    },
    'composer.mediaMode': {
      on: ['change'],
      gkeys: ['composer-media-mode'],
      handler: function(event, ctx) {
        var value = event.target.value || 'plain';
        applyComposerState(ctx, function(current) {
          var next = Object.assign({}, current, { mediaMode: value });
          if (value === 'reel') {
            next.mediaList = [];
            next.media = '';
            next.reelDuration = null;
          } else if (current.mediaMode === 'reel' && value !== 'reel') {
            next.mediaList = [];
            next.media = '';
            next.reelDuration = null;
          }
          return next;
        });
      }
    },
    'composer.attachment': {
      on: ['change'],
      gkeys: ['composer-attachment'],
      handler: function(event, ctx) {
        var value = event.target.value || 'none';
        applyComposerState(ctx, function(current) {
          var next = Object.assign({}, current, { attachmentKind: value, targetId: '' });
          if (value !== 'classified') {
            next.categoryId = '';
            next.subcategoryId = '';
            next.classifiedTitle = '';
            next.classifiedPrice = '';
            next.contactPhone = '';
          } else {
            next.mediaMode = 'plain';
            next.reelDuration = null;
          }
          if (value === 'none' || value === 'ad') {
            next.targetId = '';
          }
          if (value !== 'ad') {
            next.linkUrl = '';
          }
          return next;
        });
      }
    },
    'composer.target': {
      on: ['change'],
      gkeys: ['composer-target'],
      handler: function(event, ctx) {
        var value = event.target.value || '';
        applyComposerState(ctx, { targetId: value });
      }
    },
    'composer.target.clear': {
      on: ['click'],
      gkeys: ['composer-target-clear'],
      handler: function(event, ctx) {
        event.preventDefault();
        applyComposerState(ctx, { targetId: '' });
      }
    },
    'composer.classified.title': {
      on: ['input'],
      gkeys: ['composer-classified-title'],
      handler: function(event, ctx) {
        applyComposerState(ctx, { classifiedTitle: event.target.value });
      }
    },
    'composer.classified.price': {
      on: ['input'],
      gkeys: ['composer-classified-price'],
      handler: function(event, ctx) {
        applyComposerState(ctx, { classifiedPrice: event.target.value });
      }
    },
    'composer.classified.phone': {
      on: ['input'],
      gkeys: ['composer-classified-phone'],
      handler: function(event, ctx) {
        applyComposerState(ctx, { contactPhone: event.target.value });
      }
    },
    'composer.category': {
      on: ['change'],
      gkeys: ['composer-category'],
      handler: function(event, ctx) {
        var value = event.target.value || '';
        applyComposerState(ctx, { categoryId: value, subcategoryId: '' });
      }
    },
    'composer.subcategory': {
      on: ['change'],
      gkeys: ['composer-subcategory'],
      handler: function(event, ctx) {
        var value = event.target.value || '';
        applyComposerState(ctx, { subcategoryId: value });
      }
    },
    'composer.link': {
      on: ['input'],
      gkeys: ['composer-link-url'],
      handler: function(event, ctx) {
        var value = event.target.value || '';
        applyComposerState(ctx, { linkUrl: value });
      }
    },
    'composer.media.pick': {
      on: ['click'],
      gkeys: ['composer-media-pick'],
      handler: function(event) {
        event.preventDefault();
        if (!global.document) return;
        var input = global.document.getElementById(COMPOSER_MEDIA_INPUT_ID);
        if (input) input.click();
      }
    },
    'composer.media.file': {
      on: ['change'],
      gkeys: ['composer-media-file'],
      handler: function(event, ctx) {
        var files = event.target && event.target.files ? event.target.files : null;
        if (!files || !files.length) return;
        handleComposerMediaFiles(ctx, files);
      }
    },
    'composer.media.remove': {
      on: ['click'],
      gkeys: ['composer-media-remove'],
      handler: function(event, ctx) {
        var url = event.currentTarget && event.currentTarget.getAttribute('data-url');
        removeComposerMedia(ctx, url);
      }
    },
    'composer.add.product': {
      on: ['click'],
      gkeys: ['composer-add-product'],
      handler: function(event, ctx) {
        event.preventDefault();
        showNotice(ctx, t('composer.add.product.notice', 'انتقل إلى المتجر لإضافة منتج جديد ثم شاركه هنا'));
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'commerce' }),
            data: db.data
          };
        });
      }
    },
    'composer.add.service': {
      on: ['click'],
      gkeys: ['composer-add-service'],
      handler: function(event, ctx) {
        event.preventDefault();
        showNotice(ctx, t('composer.add.service.notice', 'انتقل إلى قسم الخدمات لإضافة عرض جديد ثم شاركه'));
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'commerce' }),
            data: db.data
          };
        });
      }
    },
    'composer.add.article': {
      on: ['click'],
      gkeys: ['composer-add-article'],
      handler: function(event, ctx) {
        event.preventDefault();
        showNotice(ctx, t('composer.add.article.notice', 'يمكنك إضافة مقالة جديدة من قسم المعرفة'));
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'knowledge' }),
            data: db.data
          };
        });
      }
    },
    'pwa.install': {
      on: ['click'],
      gkeys: ['pwa-install'],
      handler: function(event, ctx) {
        event.preventDefault();
        if (deferredInstallPrompt && typeof deferredInstallPrompt.prompt === 'function') {
          deferredInstallPrompt.prompt().catch(function(error) {
            console.warn('[SBN PWA] install prompt failed', error);
          }).finally(function() {
            deferredInstallPrompt = null;
            suppressPwaPromptForSession();
            setPwaPromptState(false);
          });
        } else {
          showNotice(ctx, t('pwa.install.instructions', 'من فضلك استخدم خيار \"تثبيت التطبيق\" من متصفحك.'));
        }
      }
    },
    'composer.submit': {
      on: ['click'],
      gkeys: ['composer-submit'],
      handler: function(event, ctx) {
        handleComposerSubmit(ctx);
      }
    },
    'comment.text': {
      on: ['input'],
      gkeys: ['comment-input'],
      handler: function(event, ctx) {
        var value = event.target.value || '';
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { commentDraft: value }),
            data: db.data
          };
        });
      }
    },
    'comment.submit': {
      on: ['click'],
      gkeys: ['comment-submit'],
      handler: function(event, ctx) {
        event.preventDefault();
        var postId = event.currentTarget && event.currentTarget.getAttribute('data-post-id');
        if (!postId) return;
        var db = app ? app.database : null;
        var draft = (db && db.state && db.state.commentDraft) || '';
        var trimmed = draft.trim();
        if (!trimmed) {
          showNotice(ctx, t('comment.error.empty', 'اكتب تعليقاً أولاً'));
          return;
        }
        var now = new Date().toISOString();
        var commentId = generateId('cmt');
        var activeUserId = (db && db.state && db.state.activeUserId) || null;
        if (!activeUserId) {
          openAuthModal('login');
          return;
        }
        var newComment = {
          comment_id: commentId,
          post_id: postId,
          user_id: activeUserId,
          content: trimmed,
          created_at: now
        };
        if (realtime && realtime.store && typeof realtime.store.insert === 'function') {
          realtime.store.insert('sbn_comments', Object.assign({}, newComment), { source: 'pwa-comment' }).catch(function(error) {
            console.warn('[SBN PWA] comment insert failed', error);
          });
        }
        ctx.setState(function(prev) {
          var comments = Array.isArray(prev.data.comments) ? prev.data.comments.slice() : [];
          comments.push(Object.assign({}, newComment));
          return {
            env: prev.env,
            meta: prev.meta,
            state: Object.assign({}, prev.state, { commentDraft: '' }),
            data: Object.assign({}, prev.data, { comments: comments })
          };
        });
        bumpPostStat(postId, 'comments_count');
      }
    },
    'profile.select': {
      on: ['click'],
      gkeys: ['profile-select'],
      handler: function(event, ctx) {
        var userId = event.currentTarget && event.currentTarget.getAttribute('data-user-id');
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { activeUserId: userId || db.state.activeUserId }),
            data: db.data
          };
        });
      }
    },
    'profile.message': {
      on: ['click'],
      gkeys: ['profile-message'],
      handler: function(event, ctx) {
        event.preventDefault();
        showNotice(ctx, t('profile.message.unavailable', 'قريباً سيتم دعم المراسلة داخل التطبيق'));
      }
    },
    'profile.edit.open': {
      on: ['click'],
      gkeys: ['profile-edit-open'],
      handler: function(event, ctx) {
        event.preventDefault();
        ctx.setState(function(db) {
          var user = getActiveUser(db);
          var nextEditor = {
            open: true,
            fullName: resolveUserName(user),
            bio: getLocalizedField(user, 'bio', ''),
            avatarUrl: (user && user.avatar_url) || ''
          };
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { profileEditor: nextEditor }),
            data: db.data
          };
        });
      }
    },
    'profile.edit.close': {
      on: ['click'],
      gkeys: ['profile-edit-close'],
      handler: function(event, ctx) {
        event.preventDefault();
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { profileEditor: Object.assign({}, db.state.profileEditor, { open: false }) }),
            data: db.data
          };
        });
      }
    },
    'profile.edit.modal': {
      on: ['click'],
      gkeys: ['profile-edit-modal'],
      handler: function(event) {
        event.stopPropagation();
      }
    },
    'profile.edit.input': {
      on: ['input'],
      gkeys: ['profile-edit-input'],
      handler: function(event, ctx) {
        var field = event.currentTarget && event.currentTarget.getAttribute('data-field');
        var value = event.target ? event.target.value : '';
        if (!field) return;
        ctx.setState(function(db) {
          var editor = Object.assign({}, db.state.profileEditor, {});
          editor[field] = value;
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { profileEditor: editor }),
            data: db.data
          };
        });
      }
    },
    'profile.edit.save': {
      on: ['click'],
      gkeys: ['profile-edit-save'],
      handler: function(event, ctx) {
        event.preventDefault();
        ctx.setState(function(db) {
          var editor = db.state.profileEditor || {};
          var users = Array.isArray(db.data.users) ? db.data.users.slice() : [];
          var activeId = db.state.activeUserId;
          var updatedUsers = users.map(function(u) {
            if (!u || u.user_id !== activeId) return u;
            var next = Object.assign({}, u, {
              avatar_url: editor.avatarUrl || u.avatar_url,
              bio: editor.bio || u.bio
            });
            if (editor.fullName) {
              next.full_name = editor.fullName;
            }
            return next;
          });
          var nextOnboarding = Object.assign({}, db.state.onboarding, {
            completed: Object.assign({}, (db.state.onboarding && db.state.onboarding.completed) || {}, {
              avatar: Boolean(editor.avatarUrl),
              bio: Boolean(editor.bio)
            })
          });
          persistOnboardingProgress(nextOnboarding);
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, {
              profileEditor: Object.assign({}, editor, { open: false }),
              onboarding: nextOnboarding
            }),
            data: Object.assign({}, db.data, { users: updatedUsers })
          };
        });
      }
    },

    'retry.load': {
      on: ['click'],
      gkeys: ['retry'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { loading: true, error: null }),
            data: db.data
          };
        });
        initRealtime();
      }
    },

    'post.open': {
      on: ['click'],
      gkeys: ['post-open'],
      handler: function(event, ctx) {
        var postId = event.currentTarget && event.currentTarget.getAttribute('data-post-id');
        if (!postId) return;
        setPostOverlay(ctx, { open: true, postId });
      }
    },

    'post.close': {
      on: ['click'],
      gkeys: ['post-close'],
      handler: function(event, ctx) {
        event.stopPropagation();
        setPostOverlay(ctx, { open: false, postId: null });
      }
    },

    'post.overlay.inner': {
      on: ['click'],
      gkeys: ['post-overlay-inner'],
      handler: function(event) {
        event.stopPropagation();
      }
    },

    'post-like': {
      on: ['click'],
      gkeys: ['post-like'],
      handler: function(event, ctx) {
        event.stopPropagation();
        var postId = event.currentTarget && event.currentTarget.getAttribute('data-post-id');
        bumpPostStat(postId, 'likes_count');
        showNotice(ctx, t('post.action.like') + ' ✓');
      }
    },

    'onboarding.complete': {
      on: ['click'],
      gkeys: ['onboarding-complete'],
      handler: function(event, ctx) {
        var taskKey = event.currentTarget && event.currentTarget.getAttribute('data-task');
        if (!taskKey) return;
        updateOnboardingState(ctx, function(current) {
          var nextCompleted = Object.assign({}, current.completed || {}, {});
          nextCompleted[taskKey] = true;
          return Object.assign({}, current, { completed: nextCompleted });
        });
      }
    },

    'onboarding.dismiss': {
      on: ['click'],
      gkeys: ['onboarding-dismiss'],
      handler: function(event, ctx) {
        event.preventDefault();
        updateOnboardingState(ctx, { dismissed: true });
      }
    },

    'post-share': {
      on: ['click'],
      gkeys: ['post-share'],
      handler: function(event, ctx) {
        event.stopPropagation();
        var postId = event.currentTarget && event.currentTarget.getAttribute('data-post-id');
        bumpPostStat(postId, 'shares_count');
        showNotice(ctx, t('post.action.share') + ' ✓');
      }
    },

    'post-subscribe': {
      on: ['click'],
      gkeys: ['post-subscribe'],
      handler: function(event, ctx) {
        event.stopPropagation();
        var postId = event.currentTarget && event.currentTarget.getAttribute('data-post-id');
        bumpPostStat(postId, 'saves_count');
        showNotice(ctx, t('post.action.subscribe') + ' ✓');
      }
    }
  };

  // ================== INITIALIZATION ==================
  var app = null;

  function disposeRealtime() {
    if (realtime && typeof realtime.disconnect === 'function') {
      try {
        realtime.disconnect();
        debugLog('[SBN PWA][rt] disposed previous realtime instance');
      } catch (err) {
        console.warn('[SBN PWA] Failed to dispose realtime store', err);
      }
    }
    clearNotificationWatch();
    realtime = null;
  }

  /**
   * Initialize realtime connection
   */
  function initRealtime() {
    debugLog('[SBN PWA][rt] initializing realtime connection...');
    disposeRealtime();
    if (typeof global.createDBAuto !== 'function') {
      console.warn('[SBN PWA] createDBAuto not available, using mock data mode');
      debugLog('[SBN PWA][rt] createDBAuto missing, staying in mock mode');
      // Mark as loaded with empty data
      if (app) {
        app.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { loading: false, error: null }),
            data: db.data
          };
        });
      }
      return;
    }

    // Fetch schema first (using query parameters, not path)
    var baseDomain = global.location && global.location.origin ? global.location.origin.replace(/\/+$/, '') : '';
    var schemaUrl = baseDomain + '/api/schema?branch=' + encodeURIComponent(BRANCH_ID) +
                    '&module=' + encodeURIComponent(MODULE_ID);
    debugLog('[SBN PWA][rt] fetching schema from', schemaUrl);

    fetch(schemaUrl, { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('schema-fetch-failed');
        return response.json();
      })
      .then(function(payload) {
        // Extract schema from payload.modules[moduleId].schema
        var moduleData = payload && payload.modules && payload.modules[MODULE_ID];
        var schema = moduleData && moduleData.schema ? moduleData.schema : null;
        if (!schema) {
          console.error('[SBN PWA] Schema not found in response:', payload);
          throw new Error('schema-invalid');
        }
        debugLog('[SBN PWA][rt] schema fetched, tables:', Object.keys(TABLE_TO_DATA_KEY));

        var tablesToWatch = Object.keys(TABLE_TO_DATA_KEY);

        realtime = global.createDBAuto(schema, tablesToWatch, {
          branchId: BRANCH_ID,
          moduleId: MODULE_ID,
          role: 'sbn-pwa',
          historyLimit: 200,
          autoReconnect: true,
          logger: console,
          lang: (app && app.database && app.database.env) ? app.database.env.lang : initialDatabase.env.lang,
          defaultLang: 'ar',
          includeLangMeta: true
        });
        debugLog('[SBN PWA][rt] realtime instance created');
        registerRealtimeStoreInstance(realtime);

        var currentLang = (app && app.database && app.database.env && app.database.env.lang) || initialDatabase.env.lang;
        fetchInitialTables(currentLang);

        return realtime.ready().then(function() {
          // Watch all tables
          tablesToWatch.forEach(function(tableName) {
            realtime.watch(tableName, function(rows) {
              debugLog('[SBN PWA][rt][watch]', tableName, 'raw payload sample:', Array.isArray(rows) ? rows.slice(0, 3) : rows);
              commitTable(app, tableName, rows);
            });
          });
          debugLog('[SBN PWA][rt] watchers registered');
          setupNotificationWatch();

          // Watch connection status
          realtime.status(function(status) {
            debugLog('[SBN PWA][rt] status update:', status);
            if (status === 'error') {
              app.setState(function(db) {
                return {
                  env: db.env,
                  meta: db.meta,
                  state: Object.assign({}, db.state, {
                    error: t('error.connection')
                  }),
                  data: db.data
                };
              });
            } else if (status === 'ready') {
              app.setState(function(db) {
                return {
                  env: db.env,
                  meta: db.meta,
                  state: Object.assign({}, db.state, { loading: false, error: null }),
                  data: db.data
                };
              });
            }
          });
        });
      })
      .catch(function(error) {
        console.error('[SBN PWA] failed to bootstrap realtime', error);
        debugLog('[SBN PWA][rt] init failed', error);
        if (app) {
          app.setState(function(db) {
            return {
              env: db.env,
              meta: db.meta,
              state: Object.assign({}, db.state, {
                loading: false,
                error: t('error.init')
              }),
              data: db.data
            };
          });
        }
      });
  }

  /**
   * Fetch initial tables via REST snapshot
   */
  function fetchInitialTables(lang) {
    var baseDomain = global.location && global.location.origin ? global.location.origin.replace(/\/+$/, '') : '';
    if (!baseDomain) return Promise.resolve();
    var url = baseDomain + '/api/branches/' + encodeURIComponent(BRANCH_ID) +
      '/modules/' + encodeURIComponent(MODULE_ID);
    if (lang) {
      url += '?lang=' + encodeURIComponent(lang);
    }
    debugLog('[SBN PWA][rest] fetching snapshot from', url);
    return fetch(url, { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('snapshot-fetch-failed');
        return response.json();
      })
      .then(function(payload) {
        var tables = payload && payload.tables;
        if (!tables || typeof tables !== 'object') {
          debugLog('[SBN PWA][rest] snapshot payload missing tables');
          return;
        }
        Object.keys(tables).forEach(function(tableName) {
          var rows = tables[tableName];
          commitTable(app, tableName, rows);
        });
      })
      .catch(function(error) {
        debugLog('[SBN PWA][rest] snapshot fetch failed', error);
      })
      .finally(function() {
        refreshLocalizedCategories(lang || getCurrentLang());
        refreshClassifiedsSnapshot(lang || getCurrentLang());
      });
  }

  /**
   * Bootstrap application - Wait for Mishkah to be ready
   */
  function bootstrap() {
    console.log('[SBN PWA] Initializing Mostamal Hawa...');

    // Apply initial theme and lang
    applyTheme(initialDatabase.env.theme);
    applyLang(initialDatabase.env.lang, initialDatabase.env.dir);

    // Helper function to wait for Mishkah to be ready
    var readyHelper = global.MishkahAuto && typeof global.MishkahAuto.ready === 'function'
      ? global.MishkahAuto.ready.bind(global.MishkahAuto)
      : function (cb) {
          return Promise.resolve().then(function () {
            if (typeof cb === 'function') cb(M);
          });
        };

    // Wait for Mishkah to be ready, then initialize app
    readyHelper(function (readyM) {
      if (!readyM || !readyM.app || typeof readyM.app.createApp !== 'function') {
        console.error('[SBN PWA] Mishkah app API not ready');
        throw new Error('[SBN PWA] mishkah-core-not-ready');
      }

      console.log('[SBN PWA] Mishkah is ready, creating app...');

      // Set body function
      readyM.app.setBody(renderBody);

      // Create app
      app = readyM.app.createApp(initialDatabase, orders);

      // Mount to DOM
      app.mount('#app');
      setupPwaInstallPrompt();

      console.log('[SBN PWA] App mounted successfully');

      // Initialize realtime connection
      initRealtime();
    }).catch(function (err) {
      console.error('[SBN PWA] Failed to initialize app:', err);
    });
  }

  // ================== START APP ==================
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
