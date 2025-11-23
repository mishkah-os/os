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

  var BASE_I18N = {};
  var realtime = null;

  // ================== TABLE MAPPINGS ==================
  var TABLE_TO_DATA_KEY = {
    'sbn_ui_labels': 'uiLabels',
    'sbn_products': 'products',
    'sbn_services': 'services',
    'sbn_wiki_articles': 'articles',
    'sbn_categories': 'categories',
    'sbn_users': 'users',
    'sbn_posts': 'posts',
    'sbn_comments': 'comments',
    'sbn_hashtags': 'hashtags',
    'sbn_reviews': 'reviews'
  };

  // ================== HELPERS ==================

  /**
   * Build i18n dictionary from sbn_ui_labels table
   */
  function buildTranslationMaps(rows) {
    var ui = {};
    (rows || []).forEach(function (row) {
      if (!row || !row.label_key || !row.lang || !row.text) return;
      if (!ui[row.label_key]) ui[row.label_key] = {};
      ui[row.label_key][row.lang] = row.text;
    });
    return { ui: ui };
  }

  /**
   * Get current env from app database
   */
  function activeEnv() {
    return app && app.database && app.database.env ? app.database.env : null;
  }

  /**
   * Translate helper function
   */
  function translate(key, fallback, lang) {
    var env = activeEnv();
    var locale = lang || (env && env.lang) || 'ar';
    var map = (env && env.i18n) || BASE_I18N;
    var entry = map[key];
    if (entry && entry[locale]) return entry[locale];
    if (entry && entry.ar) return entry.ar;
    return typeof fallback === 'string' ? fallback : key;
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

  // ================== INITIAL STATE ==================
  var persisted = loadPersistedPrefs();

  var initialDatabase = {
    env: {
      theme: persisted.theme || 'light',
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
      activeUserId: 'usr_001',
      postOverlay: {
        open: false,
        postId: null
      },
      composer: {
        open: false,
        type: 'plain',
        text: '',
        targetId: '',
        media: '',
        posting: false,
        error: null
      },
      filters: {
        search: '',
        category: '',
        condition: ''
      }
    },
    data: {
      uiLabels: [],
      products: [],
      services: [],
      articles: [],
      categories: [],
      users: [],
      posts: [],
      comments: [],
      hashtags: [],
      reviews: []
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

  function resolveUserName(user) {
    return getLocalizedField(user, 'full_name', user && user.username ? user.username : t('user.unknown'));
  }

  function resolveHashtagLabel(tag) {
    return getLocalizedField(tag, 'name', tag && tag.normalized_name ? '#' + tag.normalized_name : '');
  }

  /**
   * Commit table data to app state
   */
  function commitTable(app, tableName, rows) {
    var dataKey = TABLE_TO_DATA_KEY[tableName];
    if (!dataKey) return;

    app.setState(function (db) {
      var newData = {};
      newData[dataKey] = Array.isArray(rows) ? rows : [];

      // Special handling for UI labels
      if (tableName === 'sbn_ui_labels') {
        var maps = buildTranslationMaps(rows);
        return {
          env: Object.assign({}, db.env, { i18n: maps.ui }),
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
        )
      ])
    ]);
  }

  function renderComposer(db) {
    var composer = db.state.composer || initialDatabase.state.composer;
    var activeUser = getActiveUser(db);
    var userName = resolveUserName(activeUser);
    var avatar = (activeUser && activeUser.avatar_url) || 'https://i.pravatar.cc/120?img=12';
    if (!composer.open) {
      return D.Containers.Div({ attrs: { class: 'composer-card collapsed' } }, [
        D.Media.Img({ attrs: { class: 'composer-avatar', src: avatar, alt: userName } }, []),
        D.Forms.Button({
          attrs: { class: 'composer-trigger', 'data-m-gkey': 'composer-open' }
        }, [t('composer.start')])
      ]);
    }

    var typeOptions = [
      { value: 'plain', label: t('composer.type.plain') },
      { value: 'product_share', label: t('composer.type.product') },
      { value: 'service_share', label: t('composer.type.service') },
      { value: 'article_share', label: t('composer.type.article') },
      { value: 'reel', label: t('composer.type.reel') }
    ];
    var attachments = getAttachmentOptions(db, composer.type);
    var showTarget = attachments.length > 0;
    var showMedia = composer.type === 'reel';

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
        attrs: { class: 'composer-select', 'data-m-gkey': 'composer-type', value: composer.type || 'plain' }
      }, typeOptions.map(function(option) {
        return D.Inputs.Option({
          attrs: { value: option.value, selected: composer.type === option.value }
        }, [option.label]);
      })),
      showTarget
        ? D.Inputs.Select({
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
          ))
        : null,
      showMedia
        ? D.Inputs.Input({
            attrs: {
              type: 'text',
              class: 'composer-input',
              placeholder: t('composer.media.placeholder'),
              value: composer.media || '',
              'data-m-gkey': 'composer-media'
            }
          }, [])
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
          attrs: { class: 'hero-cta', 'data-m-gkey': 'nav-marketplace' }
        }, [t('home.action.explore')]),
        D.Forms.Button({
          attrs: { class: 'hero-ghost', 'data-m-gkey': 'nav-services' }
        }, ['＋'])
      ])
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

  function renderSectionHeader(titleKey, _unused, metaKey, _unusedMeta) {
    return D.Containers.Div({ attrs: { class: 'section-heading' } }, [
      D.Text.H3({}, [t(titleKey)]),
      metaKey
        ? D.Text.Span({ attrs: { class: 'section-meta' } }, [t(metaKey)])
        : D.Text.Span({ attrs: { class: 'section-meta' } }, [])
    ]);
  }

  function findById(rows, keyField, target) {
    if (!Array.isArray(rows)) return null;
    return rows.find(function(row) {
      return row && row[keyField] === target;
    }) || null;
  }

  function getActiveUser(db) {
    var users = db.data.users || [];
    var activeId = db.state.activeUserId;
    if (!activeId && users.length) {
      activeId = users[0].user_id;
    }
    return findById(users, 'user_id', activeId) || (users.length ? users[0] : null);
  }

  function getAttachmentOptions(db, type) {
    if (type === 'product_share') {
      return (db.data.products || []).map(function(product) {
        return { value: product.product_id, label: resolveProductTitle(product) };
      });
    }
    if (type === 'service_share') {
      return (db.data.services || []).map(function(service) {
        return { value: service.service_id, label: getLocalizedField(service, 'title', t('services.default')) };
      });
    }
    if (type === 'article_share') {
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
      return {
        env: db.env,
        meta: db.meta,
        state: Object.assign({}, db.state, { composer: nextComposer }),
        data: db.data
      };
    });
  }

  function setPostOverlay(ctx, updates) {
    ctx.setState(function(db) {
      var currentOverlay = db.state.postOverlay || initialDatabase.state.postOverlay;
      var nextOverlay = typeof updates === 'function' ? updates(currentOverlay) : Object.assign({}, currentOverlay, updates);
      return {
        env: db.env,
        meta: db.meta,
        state: Object.assign({}, db.state, { postOverlay: nextOverlay }),
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
    var composer = currentDb.state.composer || initialDatabase.state.composer;
    if (composer.posting) return;
    var user = getActiveUser(currentDb);
    if (!user) {
      applyComposerState(ctx, { error: t('composer.error.user') });
      return;
    }
    if (!realtime || !realtime.store || typeof realtime.store.insert !== 'function') {
      applyComposerState(ctx, { error: t('composer.error.offline'), posting: false });
      return;
    }
    if ((!composer.text || !composer.text.trim()) && composer.type === 'plain') {
      applyComposerState(ctx, { error: t('composer.error.empty'), posting: false });
      return;
    }
    if (composer.type !== 'plain' && composer.type !== 'reel' && !composer.targetId) {
      applyComposerState(ctx, { error: t('composer.error.target'), posting: false });
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
      post_type: composer.type || 'plain',
      visibility: 'public',
      is_pinned: false,
      likes_count: 0,
      comments_count: 0,
      shares_count: 0,
      views_count: 0,
      created_at: now,
      updated_at: now
    };
    if (composer.type === 'product_share') {
      record.shared_product_id = composer.targetId;
    } else if (composer.type === 'service_share') {
      record.shared_service_id = composer.targetId;
    } else if (composer.type === 'article_share') {
      record.shared_article_id = composer.targetId;
    }
    if (composer.media) {
      record.media_urls = JSON.stringify([composer.media.trim()]);
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
          var resetComposer = {
            open: false,
            type: 'plain',
            text: '',
            targetId: '',
            media: '',
            posting: false,
            error: null
          };
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

  function renderPostCard(db, post) {
    var users = db.data.users || [];
    var products = db.data.products || [];
    var services = db.data.services || [];
    var articles = db.data.articles || [];
    var user = findById(users, 'user_id', post.user_id);
    var userName = resolveUserName(user);
    var avatar = (user && user.avatar_url) || 'https://i.pravatar.cc/120?img=60';
    var mediaList = toArray(post.media_urls);
    var attachment = null;

    if (post.post_type === 'product_share' && post.shared_product_id) {
      var product = findById(products, 'product_id', post.shared_product_id);
      if (product) attachment = renderProductCard(db, product, { compact: true });
    } else if (post.post_type === 'article_share' && post.shared_article_id) {
      var article = findById(articles, 'article_id', post.shared_article_id);
      if (article) {
        attachment = D.Containers.Div({ attrs: { class: 'feed-attachment' } }, [
          D.Text.Span({ attrs: { class: 'chip' } }, [t('knowledge.title')]),
          D.Text.P({}, [getLocalizedField(article, 'title', t('knowledge.card.title'))])
        ]);
      }
    } else if (post.post_type === 'service_share' && post.shared_service_id) {
      var service = findById(services, 'service_id', post.shared_service_id);
      if (service) {
        attachment = D.Containers.Div({ attrs: { class: 'feed-attachment' } }, [
          D.Text.Span({ attrs: { class: 'chip' } }, [t('nav.services')]),
          D.Text.P({}, [getLocalizedField(service, 'title', t('services.default'))])
        ]);
      }
    }

    var mediaStrip = null;
    if (mediaList.length) {
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
            t('post.type.' + (post.post_type || 'plain')) || (post.post_type || 'post'),
            ' · ',
            new Date(post.created_at).toLocaleDateString()
          ])
        ]),
        post.is_pinned
          ? D.Text.Span({ attrs: { class: 'chip' } }, [t('post.pinned')])
          : null
      ].filter(Boolean)),
      D.Text.P({ attrs: { class: 'feed-content' } }, [
        getLocalizedField(post, 'content', '')
      ]),
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

  function renderCategoryChips(db, categories, field, gkey) {
    var selected = db.state.filters[field] || '';
    var chips = [
      D.Forms.Button({
        attrs: {
          class: 'chip' + (selected === '' ? ' chip-active' : ''),
          'data-m-gkey': gkey,
          'data-value': ''
        }
      }, [t('filter.all')])
    ];
    chips = chips.concat(categories.map(function(cat) {
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
        ])
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
    var categories = (db.data.categories || []).slice(0, 6);

    var sections = [
      renderComposer(db),
      renderSocialFeed(db),
      renderHero(db),
      renderTrendingHashtags(db),
      renderMetricGrid(db),
      D.Containers.Div({ attrs: { class: 'section-card' } }, [
        renderSectionHeader('home.categories', null, 'home.categories.meta', null),
        D.Containers.Div({ attrs: { class: 'chips-row' } },
          renderCategoryChips(db, categories, 'category', 'category-chip')
        )
      ]),
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
    ].filter(Boolean);

    return D.Containers.Div({ attrs: { class: 'app-section' } }, sections);
  }

  /**
   * Render marketplace section
   */
  function renderMarketplace(db) {
    var products = getFilteredProducts(db);
    var categories = (db.data.categories || []).filter(function(cat) {
      return cat.type === 'product';
    }).slice(0, 8);

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
      ])
    ]);
  }

  /**
   * Render services section
   */
  function renderServices(db) {
    var services = getFilteredServices(db);
    var categories = (db.data.categories || []).filter(function(cat) {
      return cat.type === 'service';
    }).slice(0, 8);

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
    return D.Containers.Div({
      attrs: {
        class: 'article-card',
        key: article.article_id,
        'data-m-key': 'article-' + article.article_id
      }
    }, [
      D.Text.H4({ attrs: { class: 'article-title' } }, [getLocalizedField(article, 'title', t('knowledge.card.title'))]),
      D.Text.P({ attrs: { class: 'article-summary' } }, [getLocalizedField(article, 'excerpt', excerpt) || t('wiki.noSummary')]),
      D.Containers.Div({ attrs: { class: 'article-meta' } }, [
        D.Text.Span({}, [String(views) + ' ' + t('wiki.views')]),
        D.Forms.Button({
          attrs: {
            'data-m-gkey': 'view-article',
            'data-article-id': article.article_id,
            class: 'chip'
          }
        }, [t('btn.read')])
      ])
    ]);
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
          D.Forms.Button({ attrs: { class: 'hero-ghost', 'data-m-gkey': 'profile-message' } }, [t('profile.cta.message')])
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

    return D.Containers.Div({
      attrs: { class: 'post-overlay', 'data-m-gkey': 'post-close' }
    }, [
      D.Containers.Div({ attrs: { class: 'post-overlay-panel', 'data-m-gkey': 'post-overlay-inner' } }, [
        D.Containers.Div({ attrs: { class: 'feed-header' } }, [
          D.Media.Img({ attrs: { class: 'feed-avatar', src: avatar, alt: userName } }, []),
          D.Containers.Div({ attrs: { class: 'feed-user' } }, [
            D.Text.Span({ attrs: { class: 'feed-user-name' } }, [userName]),
            D.Text.Span({ attrs: { class: 'feed-user-meta' } }, [
              t('post.type.' + (post.post_type || 'plain'), post.post_type || 'post'),
              ' · ',
              new Date(post.created_at).toLocaleString()
            ])
          ]),
          D.Forms.Button({ attrs: { class: 'composer-close', 'data-m-gkey': 'post-close' } }, ['✕'])
        ]),
        D.Text.P({ attrs: { class: 'feed-content' } }, [langContent]),
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
        D.Containers.Div({ attrs: { class: 'overlay-comments' } }, commentList)
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
          'data-m-gkey': 'nav-home',
          class: 'nav-item' + (currentSection === 'timeline' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🏠']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.timeline')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-marketplace',
          class: 'nav-item' + (currentSection === 'marketplace' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🛒']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.marketplace')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-services',
          class: 'nav-item' + (currentSection === 'services' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🔧']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.services')])
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
          'data-m-gkey': 'nav-profile',
          class: 'nav-item' + (currentSection === 'profile' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['👤']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.profile')])
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
      case 'marketplace':
        sectionView = renderMarketplace(db);
        break;
      case 'services':
        sectionView = renderServices(db);
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
        renderNotice(db),
        renderHeader(db),
        D.Containers.Main({ attrs: { class: 'app-main' } }, [sectionView]),
        renderBottomNav(db),
        renderPostOverlay(db)
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

    'nav.marketplace': {
      on: ['click'],
      gkeys: ['nav-marketplace'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'marketplace' }),
            data: db.data
          };
        });
      }
    },

    'nav.services': {
      on: ['click'],
      gkeys: ['nav-services'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'services' }),
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
        applyComposerState(ctx, function(current) {
          return Object.assign({}, current, { open: true, error: null });
        });
      }
    },
    'composer.close': {
      on: ['click'],
      gkeys: ['composer-close'],
      handler: function(event, ctx) {
        applyComposerState(ctx, { open: false, posting: false });
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
    'composer.type': {
      on: ['change'],
      gkeys: ['composer-type'],
      handler: function(event, ctx) {
        var value = event.target.value || 'plain';
        applyComposerState(ctx, { type: value, targetId: '' });
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
    'composer.media': {
      on: ['input'],
      gkeys: ['composer-media'],
      handler: function(event, ctx) {
        applyComposerState(ctx, { media: event.target.value });
      }
    },
    'composer.submit': {
      on: ['click'],
      gkeys: ['composer-submit'],
      handler: function(event, ctx) {
        handleComposerSubmit(ctx);
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
      handler: function() {
        console.info('[SBN PWA] message action tapped');
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
        showNotice(ctx, t('post.action.like') + ' ✓');
      }
    },

    'post-share': {
      on: ['click'],
      gkeys: ['post-share'],
      handler: function(event, ctx) {
        event.stopPropagation();
        showNotice(ctx, t('post.action.share') + ' ✓');
      }
    },

    'post-subscribe': {
      on: ['click'],
      gkeys: ['post-subscribe'],
      handler: function(event, ctx) {
        event.stopPropagation();
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
      } catch (err) {
        console.warn('[SBN PWA] Failed to dispose realtime store', err);
      }
    }
    realtime = null;
  }

  /**
   * Initialize realtime connection
   */
  function initRealtime() {
    disposeRealtime();
    if (typeof global.createDBAuto !== 'function') {
      console.warn('[SBN PWA] createDBAuto not available, using mock data mode');
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
    var baseDomain = typeof global.basedomain === 'string' && global.basedomain.trim()
      ? global.basedomain.trim().replace(/\/+$/, '')
      : '';
    var schemaUrl = (baseDomain || '') + '/api/schema?branch=' + encodeURIComponent(BRANCH_ID) +
                    '&module=' + encodeURIComponent(MODULE_ID);

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

        return realtime.ready().then(function() {
          // Watch all tables
          tablesToWatch.forEach(function(tableName) {
            realtime.watch(tableName, function(rows) {
              commitTable(app, tableName, Array.isArray(rows) ? rows : []);
            });
          });

          // Watch connection status
          realtime.status(function(status) {
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
