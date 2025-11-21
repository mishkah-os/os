/**
 * مستعمل حوا (Mostamal Hawa) - PWA Mobile Application
 * Schema-driven, fully internationalized, NO hardcoded text
 * All data including UI labels come from backend
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
    'sbn_users': 'users'
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
      currentSection: 'home',
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
      users: []
    }
  };

  // ================== DATA HELPERS ==================

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
        var nameMatch = product.name && product.name.toLowerCase().indexOf(searchLower) !== -1;
        var descMatch = product.description && product.description.toLowerCase().indexOf(searchLower) !== -1;
        if (!nameMatch && !descMatch) return false;
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
        t('loading.app', 'جاري التحميل...')
      ])
    ]);
  }

  /**
   * Render error screen
   */
  function renderError(db) {
    return D.Containers.Div({ attrs: { class: 'error-screen' } }, [
      D.Text.H2({}, [t('error.title', 'حدث خطأ')]),
      D.Text.P({}, [db.state.error || t('error.generic', 'حدث خطأ أثناء تحميل البيانات')]),
      D.Forms.Button(
        { attrs: { 'data-m-gkey': 'retry', class: 'btn-primary' } },
        [t('btn.retry', 'إعادة المحاولة')]
      )
    ]);
  }

  /**
   * Render top header
   */
  function renderHeader(db) {
    return D.Containers.Header({ attrs: { class: 'app-header' } }, [
      D.Containers.Div({ attrs: { class: 'header-content' } }, [
        // App title
        D.Text.H1({ attrs: { class: 'app-title' } }, [
          t('app.name', 'مستعمل حوا')
        ]),

        // Controls
        D.Containers.Div({ attrs: { class: 'header-controls' } }, [
          // Theme toggle
          D.Forms.Button(
            { attrs: {
              'data-m-gkey': 'toggle-theme',
              class: 'icon-btn',
              title: t('settings.theme.toggle', 'تبديل الوضع')
            } },
            [db.env.theme === 'dark' ? '☀️' : '🌙']
          ),

          // Language toggle
          D.Forms.Button(
            { attrs: {
              'data-m-gkey': 'toggle-lang',
              class: 'icon-btn',
              title: t('settings.language.toggle', 'تبديل اللغة')
            } },
            [db.env.lang === 'ar' ? 'EN' : 'ع']
          )
        ])
      ])
    ]);
  }

  /**
   * Render product card
   */
  function renderProductCard(db, product) {
    return D.Containers.Div({
      attrs: {
        class: 'product-card',
        key: product.product_id,
        'data-m-key': 'product-' + product.product_id
      }
    }, [
      D.Media.Img({
        attrs: {
          src: product.main_image_url || '/projects/sbn/placeholder.jpg',
          alt: product.name,
          class: 'product-image'
        }
      }, []),
      D.Containers.Div({ attrs: { class: 'product-content' } }, [
        D.Text.H4({ attrs: { class: 'product-name' } }, [product.name]),
        D.Text.P({ attrs: { class: 'product-price' } }, [
          String(product.price) + ' ' + t('currency.sar', 'ريال')
        ]),
        D.Containers.Div({ attrs: { class: 'product-meta' } }, [
          D.Text.Span({ attrs: { class: 'product-condition' } }, [
            t('product.condition.' + product.condition, product.condition)
          ]),
          D.Text.Span({ attrs: { class: 'product-location' } }, [
            product.city || ''
          ])
        ])
      ]),
      D.Containers.Div({ attrs: { class: 'product-actions' } }, [
        D.Forms.Button(
          { attrs: {
            'data-m-gkey': 'view-product',
            'data-product-id': product.product_id,
            class: 'btn-secondary'
          } },
          [t('btn.view', 'عرض')]
        )
      ])
    ]);
  }

  /**
   * Render home section
   */
  function renderHome(db) {
    var products = db.data.products || [];
    var services = db.data.services || [];
    var articles = db.data.articles || [];

    return D.Containers.Div({ attrs: { class: 'section section-home' } }, [
      // Welcome banner
      D.Containers.Div({ attrs: { class: 'welcome-banner' } }, [
        D.Text.H2({}, [t('home.welcome', 'مرحباً بك في مستعمل حوا')]),
        D.Text.P({}, [t('home.subtitle', 'منصتك للتجارة والخدمات والمعرفة')])
      ]),

      // Quick stats
      D.Containers.Div({ attrs: { class: 'stats-grid' } }, [
        D.Containers.Div({ attrs: { class: 'stat-card' } }, [
          D.Text.Span({ attrs: { class: 'stat-number' } }, [String(products.length)]),
          D.Text.Span({ attrs: { class: 'stat-label' } }, [t('home.stats.products', 'منتج')])
        ]),
        D.Containers.Div({ attrs: { class: 'stat-card' } }, [
          D.Text.Span({ attrs: { class: 'stat-number' } }, [String(services.length)]),
          D.Text.Span({ attrs: { class: 'stat-label' } }, [t('home.stats.services', 'خدمة')])
        ]),
        D.Containers.Div({ attrs: { class: 'stat-card' } }, [
          D.Text.Span({ attrs: { class: 'stat-number' } }, [String(articles.length)]),
          D.Text.Span({ attrs: { class: 'stat-label' } }, [t('home.stats.articles', 'مقال')])
        ])
      ]),

      // Recent items
      D.Containers.Div({ attrs: { class: 'recent-section' } }, [
        D.Text.H3({}, [t('home.recent.title', 'آخر المنتجات')]),
        D.Containers.Div({ attrs: { class: 'cards-grid' } },
          products.slice(0, 4).map(function(product) {
            return renderProductCard(db, product);
          })
        )
      ])
    ]);
  }

  /**
   * Render marketplace section
   */
  function renderMarketplace(db) {
    var products = getFilteredProducts(db);
    var categories = (db.data.categories || []).filter(function(cat) {
      return cat.type === 'product';
    });

    return D.Containers.Div({ attrs: { class: 'section section-marketplace' } }, [
      // Filters
      D.Containers.Div({ attrs: { class: 'filters-bar' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: t('placeholder.search', 'بحث...'),
            'data-m-gkey': 'search-input',
            class: 'search-input',
            value: db.state.filters.search || ''
          }
        }, []),
        D.Inputs.Select({
          attrs: {
            'data-m-gkey': 'category-filter',
            class: 'filter-select'
          }
        }, [
          D.Inputs.Option({ attrs: { value: '' } }, [t('filter.all.categories', 'كل الفئات')])
        ].concat(
          categories.map(function(cat) {
            return D.Inputs.Option({
              attrs: {
                value: cat.category_id,
                selected: db.state.filters.category === cat.category_id
              }
            }, [cat.name]);
          })
        )),
        D.Inputs.Select({
          attrs: {
            'data-m-gkey': 'condition-filter',
            class: 'filter-select'
          }
        }, [
          D.Inputs.Option({ attrs: { value: '' } }, [t('filter.all.conditions', 'كل الحالات')]),
          D.Inputs.Option({
            attrs: {
              value: 'new',
              selected: db.state.filters.condition === 'new'
            }
          }, [t('product.condition.new', 'جديد')]),
          D.Inputs.Option({
            attrs: {
              value: 'used',
              selected: db.state.filters.condition === 'used'
            }
          }, [t('product.condition.used', 'مستعمل')])
        ])
      ]),

      // Products grid
      D.Containers.Div({ attrs: { class: 'products-grid' } },
        products.length > 0
          ? products.map(function(product) {
              return renderProductCard(db, product);
            })
          : [D.Text.P({ attrs: { class: 'empty-message' } }, [
              t('marketplace.empty', 'لا توجد منتجات')
            ])]
      )
    ]);
  }

  /**
   * Render service card
   */
  function renderServiceCard(db, service) {
    return D.Containers.Div({
      attrs: {
        class: 'service-card',
        key: service.service_id,
        'data-m-key': 'service-' + service.service_id
      }
    }, [
      D.Containers.Div({ attrs: { class: 'service-content' } }, [
        D.Text.H4({ attrs: { class: 'service-title' } }, [service.title]),
        D.Text.P({ attrs: { class: 'service-description' } }, [service.description || '']),
        D.Containers.Div({ attrs: { class: 'service-meta' } }, [
          D.Text.Span({ attrs: { class: 'service-price' } }, [
            String(service.price_from) + ' - ' + String(service.price_to) + ' ' + t('currency.sar', 'ريال')
          ]),
          D.Text.Span({ attrs: { class: 'service-location' } }, [service.city || ''])
        ])
      ]),
      D.Containers.Div({ attrs: { class: 'service-actions' } }, [
        D.Forms.Button(
          { attrs: {
            'data-m-gkey': 'view-service',
            'data-service-id': service.service_id,
            class: 'btn-secondary'
          } },
          [t('btn.view', 'عرض')]
        )
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
    });

    return D.Containers.Div({ attrs: { class: 'section section-services' } }, [
      D.Containers.Div({ attrs: { class: 'filters-bar' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: t('placeholder.search', 'بحث...'),
            'data-m-gkey': 'search-input',
            class: 'search-input',
            value: db.state.filters.search || ''
          }
        }, []),
        D.Inputs.Select({
          attrs: {
            'data-m-gkey': 'category-filter',
            class: 'filter-select'
          }
        }, [
          D.Inputs.Option({ attrs: { value: '' } }, [t('filter.all.categories', 'كل الفئات')])
        ].concat(
          categories.map(function(cat) {
            return D.Inputs.Option({
              attrs: {
                value: cat.category_id,
                selected: db.state.filters.category === cat.category_id
              }
            }, [cat.name]);
          })
        ))
      ]),

      D.Containers.Div({ attrs: { class: 'services-list' } },
        services.length > 0
          ? services.map(function(service) {
              return renderServiceCard(db, service);
            })
          : [D.Text.P({ attrs: { class: 'empty-message' } }, [
              t('services.empty', 'لا توجد خدمات')
            ])]
      )
    ]);
  }

  /**
   * Render article item
   */
  function renderArticleItem(db, article) {
    return D.Containers.Div({
      attrs: {
        class: 'article-item',
        key: article.article_id,
        'data-m-key': 'article-' + article.article_id
      }
    }, [
      D.Containers.Div({ attrs: { class: 'article-content' } }, [
        D.Text.H4({ attrs: { class: 'article-title' } }, [article.title]),
        D.Text.P({ attrs: { class: 'article-summary' } }, [article.summary || '']),
        D.Containers.Div({ attrs: { class: 'article-meta' } }, [
          D.Text.Span({ attrs: { class: 'article-views' } }, [
            String(article.view_count || 0) + ' ' + t('wiki.views', 'مشاهدة')
          ])
        ])
      ]),
      D.Forms.Button(
        { attrs: {
          'data-m-gkey': 'view-article',
          'data-article-id': article.article_id,
          class: 'btn-link'
        } },
        [t('btn.read', 'قراءة')]
      )
    ]);
  }

  /**
   * Render knowledge section
   */
  function renderKnowledge(db) {
    var articles = getWikiArticles(db);

    return D.Containers.Div({ attrs: { class: 'section section-knowledge' } }, [
      D.Text.H2({}, [t('knowledge.title', 'المعرفة')]),
      D.Text.P({ attrs: { class: 'section-subtitle' } }, [
        t('knowledge.subtitle', 'مقالات تشاركية')
      ]),
      D.Containers.Div({ attrs: { class: 'search-bar' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: t('placeholder.search.articles', 'بحث في المقالات...'),
            'data-m-gkey': 'search-input',
            class: 'search-input'
          }
        }, [])
      ]),
      D.Containers.Div({ attrs: { class: 'articles-list' } },
        articles.length > 0
          ? articles.map(function(article) {
              return renderArticleItem(db, article);
            })
          : [D.Text.P({ attrs: { class: 'empty-message' } }, [
              t('knowledge.empty', 'لا توجد مقالات')
            ])]
      )
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
          class: 'nav-item' + (currentSection === 'home' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🏠']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.home', 'الرئيسية')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-marketplace',
          class: 'nav-item' + (currentSection === 'marketplace' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🛒']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.marketplace', 'المتجر')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-services',
          class: 'nav-item' + (currentSection === 'services' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🔧']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.services', 'الخدمات')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-knowledge',
          class: 'nav-item' + (currentSection === 'knowledge' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['📚']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.knowledge', 'المعرفة')])
      ]),
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-profile',
          class: 'nav-item' + (currentSection === 'profile' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['👤']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [t('nav.profile', 'الملف')])
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
        sectionView = D.Containers.Div({ attrs: { class: 'section' } }, [
          D.Text.H2({}, [t('nav.profile', 'الملف الشخصي')])
        ]);
        break;
      case 'home':
      default:
        sectionView = renderHome(db);
    }

    return D.Containers.Div({ attrs: { class: 'app-container' } }, [
      renderHeader(db),
      D.Containers.Main({ attrs: { class: 'app-main' } }, [sectionView]),
      renderBottomNav(db)
    ]);
  }

  // ================== EVENT HANDLERS (ORDERS) ==================
  var orders = {
    'nav.home': {
      on: ['click'],
      gkeys: ['nav-home'],
      handler: function(event, ctx) {
        ctx.setState(function(db) {
          return {
            env: db.env,
            meta: db.meta,
            state: Object.assign({}, db.state, { currentSection: 'home' }),
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
            state: db.state,
            data: db.data
          };
        });
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
    }
  };

  // ================== INITIALIZATION ==================
  var app = null;

  /**
   * Initialize realtime connection
   */
  function initRealtime() {
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

    // Fetch schema first
    var schemaUrl = '/api/schema/' + BRANCH_ID + '/' + MODULE_ID;

    fetch(schemaUrl, { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('schema-fetch-failed');
        return response.json();
      })
      .then(function(payload) {
        var schema = payload && payload.schema ? payload.schema : null;
        if (!schema) throw new Error('schema-invalid');

        var tablesToWatch = Object.keys(TABLE_TO_DATA_KEY);

        realtime = global.createDBAuto(schema, tablesToWatch, {
          branchId: BRANCH_ID,
          moduleId: MODULE_ID,
          role: 'sbn-pwa',
          historyLimit: 200,
          autoReconnect: true,
          logger: console,
          lang: app.database.env.lang
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
                    error: t('error.connection', 'انقطع الاتصال بقاعدة البيانات')
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
                error: t('error.init', 'فشل الاتصال بالخادم')
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
