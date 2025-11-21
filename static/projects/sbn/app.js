/**
 * مستعمل حوا (Mostamal Hawa) - PWA Mobile Application
 * Schema-driven, fully internationalized, NO hardcoded text
 * All data including UI labels come from backend
 */

(function() {
  'use strict';

  // ================== CONFIGURATION ==================
  var BRANCH_ID = 'sbn';
  var MODULE_ID = 'mostamal';

  // Store instance
  var store = null;

  // ================== TRANSLATION HELPER ==================
  /**
   * Build i18n dictionary from sbn_ui_labels table
   * Returns object like: { 'app.name': { ar: 'مستعمل حوا', en: 'Mostamal Hawa' } }
   */
  function buildI18nDict(labelRows) {
    var dict = {};
    if (!labelRows || !Array.isArray(labelRows)) return dict;

    labelRows.forEach(function(row) {
      if (!row || !row.label_key || !row.lang || !row.text) return;

      if (!dict[row.label_key]) {
        dict[row.label_key] = {};
      }
      dict[row.label_key][row.lang] = row.text;
    });

    return dict;
  }

  // ================== DATA LOADING ==================
  var appData = {
    uiLabels: [],
    products: [],
    services: [],
    articles: [],
    categories: [],
    users: [],
    loaded: false,
    error: null
  };

  /**
   * Load all application data from backend
   */
  async function loadAppData() {
    try {
      console.log('Loading application data...');

      // Load UI labels first (critical for i18n)
      var labelsResult = await store.query('sbn_ui_labels', {});
      appData.uiLabels = labelsResult.rows || [];
      console.log('Loaded UI labels:', appData.uiLabels.length);

      // Load categories (needed for filtering)
      var categoriesResult = await store.query('sbn_categories', {});
      appData.categories = categoriesResult.rows || [];
      console.log('Loaded categories:', appData.categories.length);

      // Load products
      var productsResult = await store.query('sbn_products', {});
      appData.products = productsResult.rows || [];
      console.log('Loaded products:', appData.products.length);

      // Load services
      var servicesResult = await store.query('sbn_services', {});
      appData.services = servicesResult.rows || [];
      console.log('Loaded services:', appData.services.length);

      // Load wiki articles
      var articlesResult = await store.query('sbn_wiki_articles', {});
      appData.articles = articlesResult.rows || [];
      console.log('Loaded articles:', appData.articles.length);

      // Load users (for profile display)
      var usersResult = await store.query('sbn_users', {});
      appData.users = usersResult.rows || [];
      console.log('Loaded users:', appData.users.length);

      appData.loaded = true;
      appData.error = null;

      return true;
    } catch (err) {
      console.error('Error loading app data:', err);
      appData.error = err.message || 'Failed to load data';
      appData.loaded = false;
      return false;
    }
  }

  // ================== VIEW HELPERS ==================

  /**
   * Get current active section from database
   */
  function getActiveSection(db) {
    return db.currentSection || 'home';
  }

  /**
   * Get filtered products based on current filters
   */
  function getFilteredProducts(db) {
    var products = appData.products || [];
    var filters = db.filters || {};

    return products.filter(function(product) {
      // Category filter
      if (filters.category && product.category_id !== filters.category) {
        return false;
      }

      // Condition filter (new/used)
      if (filters.condition && product.condition !== filters.condition) {
        return false;
      }

      // Search text filter
      if (filters.search) {
        var searchLower = filters.search.toLowerCase();
        var nameMatch = product.name && product.name.toLowerCase().includes(searchLower);
        var descMatch = product.description && product.description.toLowerCase().includes(searchLower);
        if (!nameMatch && !descMatch) return false;
      }

      // Status filter (active only by default)
      if (product.status !== 'active') return false;

      return true;
    });
  }

  /**
   * Get filtered services
   */
  function getFilteredServices(db) {
    var services = appData.services || [];
    var filters = db.filters || {};

    return services.filter(function(service) {
      if (filters.category && service.category_id !== filters.category) {
        return false;
      }
      if (filters.search) {
        var searchLower = filters.search.toLowerCase();
        var nameMatch = service.title && service.title.toLowerCase().includes(searchLower);
        var descMatch = service.description && service.description.toLowerCase().includes(searchLower);
        if (!nameMatch && !descMatch) return false;
      }
      if (service.status !== 'active') return false;
      return true;
    });
  }

  /**
   * Get wiki articles tree (top-level only for now)
   */
  function getWikiArticles(db) {
    var articles = appData.articles || [];
    return articles.filter(function(article) {
      return !article.parent_id && article.status === 'published';
    });
  }

  // ================== VIEW COMPONENTS ==================

  /**
   * Render loading screen
   */
  function renderLoading(db, D) {
    return D.Containers.Div({ attrs: { class: 'loading-screen' } }, [
      D.Containers.Div({ attrs: { class: 'loading-spinner' } }, []),
      D.Text.P({ attrs: { class: 'loading-text' } }, [
        Mishkah.t(db, 'loading.app')
      ])
    ]);
  }

  /**
   * Render error screen
   */
  function renderError(db, D) {
    return D.Containers.Div({ attrs: { class: 'error-screen' } }, [
      D.Text.H2({}, [Mishkah.t(db, 'error.title')]),
      D.Text.P({}, [db.errorMessage || Mishkah.t(db, 'error.generic')]),
      D.Forms.Button(
        { attrs: { 'data-m-gkey': 'retry', class: 'btn-primary' } },
        [Mishkah.t(db, 'btn.retry')]
      )
    ]);
  }

  /**
   * Render top header with theme/language controls
   */
  function renderHeader(db, D) {
    return D.Containers.Header({ attrs: { class: 'app-header' } }, [
      D.Containers.Div({ attrs: { class: 'header-content' } }, [
        // App title
        D.Text.H1({ attrs: { class: 'app-title' } }, [
          Mishkah.t(db, 'app.name')
        ]),

        // Controls container
        D.Containers.Div({ attrs: { class: 'header-controls' } }, [
          // Theme toggle
          D.Forms.Button(
            { attrs: {
              'data-m-gkey': 'toggle-theme',
              class: 'btn-icon',
              title: Mishkah.t(db, 'settings.theme.toggle')
            } },
            [db.theme === 'dark' ? '☀️' : '🌙']
          ),

          // Language toggle
          D.Forms.Button(
            { attrs: {
              'data-m-gkey': 'toggle-lang',
              class: 'btn-icon',
              title: Mishkah.t(db, 'settings.language.toggle')
            } },
            [db.lang === 'ar' ? 'EN' : 'ع']
          )
        ])
      ])
    ]);
  }

  /**
   * Render home section
   */
  function renderHome(db, D) {
    return D.Containers.Div({ attrs: { class: 'section section-home' } }, [
      // Welcome banner
      D.Containers.Div({ attrs: { class: 'welcome-banner' } }, [
        D.Text.H2({}, [Mishkah.t(db, 'home.welcome')]),
        D.Text.P({}, [Mishkah.t(db, 'home.subtitle')])
      ]),

      // Quick stats
      D.Containers.Div({ attrs: { class: 'stats-grid' } }, [
        D.Containers.Div({ attrs: { class: 'stat-card' } }, [
          D.Text.Span({ attrs: { class: 'stat-number' } }, [
            String(appData.products.length)
          ]),
          D.Text.Span({ attrs: { class: 'stat-label' } }, [
            Mishkah.t(db, 'home.stats.products')
          ])
        ]),
        D.Containers.Div({ attrs: { class: 'stat-card' } }, [
          D.Text.Span({ attrs: { class: 'stat-number' } }, [
            String(appData.services.length)
          ]),
          D.Text.Span({ attrs: { class: 'stat-label' } }, [
            Mishkah.t(db, 'home.stats.services')
          ])
        ]),
        D.Containers.Div({ attrs: { class: 'stat-card' } }, [
          D.Text.Span({ attrs: { class: 'stat-number' } }, [
            String(appData.articles.length)
          ]),
          D.Text.Span({ attrs: { class: 'stat-label' } }, [
            Mishkah.t(db, 'home.stats.articles')
          ])
        ])
      ]),

      // Recent items preview
      D.Containers.Div({ attrs: { class: 'recent-section' } }, [
        D.Text.H3({}, [Mishkah.t(db, 'home.recent.title')]),
        D.Containers.Div({ attrs: { class: 'cards-grid' } },
          appData.products.slice(0, 4).map(function(product) {
            return renderProductCard(db, D, product);
          })
        )
      ])
    ]);
  }

  /**
   * Render product card
   */
  function renderProductCard(db, D, product) {
    return D.Containers.Div({
      attrs: {
        class: 'product-card',
        key: product.product_id,
        'data-m-key': 'product-' + product.product_id
      }
    }, [
      // Image
      D.Media.Img({
        attrs: {
          src: product.main_image_url || '/static/projects/sbn/placeholder.jpg',
          alt: product.name,
          class: 'product-image'
        }
      }, []),

      // Content
      D.Containers.Div({ attrs: { class: 'product-content' } }, [
        D.Text.H4({ attrs: { class: 'product-name' } }, [product.name]),
        D.Text.P({ attrs: { class: 'product-price' } }, [
          String(product.price) + ' ' + Mishkah.t(db, 'currency.sar')
        ]),
        D.Containers.Div({ attrs: { class: 'product-meta' } }, [
          D.Text.Span({ attrs: { class: 'product-condition' } }, [
            Mishkah.t(db, 'product.condition.' + product.condition)
          ]),
          D.Text.Span({ attrs: { class: 'product-location' } }, [
            product.city || ''
          ])
        ])
      ]),

      // Actions
      D.Containers.Div({ attrs: { class: 'product-actions' } }, [
        D.Forms.Button(
          { attrs: {
            'data-m-gkey': 'view-product',
            'data-product-id': product.product_id,
            class: 'btn-secondary'
          } },
          [Mishkah.t(db, 'btn.view')]
        )
      ])
    ]);
  }

  /**
   * Render marketplace section
   */
  function renderMarketplace(db, D) {
    var products = getFilteredProducts(db);
    var categories = appData.categories.filter(function(cat) {
      return cat.type === 'product';
    });

    return D.Containers.Div({ attrs: { class: 'section section-marketplace' } }, [
      // Search and filters
      D.Containers.Div({ attrs: { class: 'filters-bar' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: Mishkah.t(db, 'placeholder.search'),
            'data-m-gkey': 'search-input',
            class: 'search-input',
            value: db.filters?.search || ''
          }
        }, []),

        D.Inputs.Select({
          attrs: {
            'data-m-gkey': 'category-filter',
            class: 'filter-select'
          }
        }, [
          D.Inputs.Option({ attrs: { value: '' } }, [
            Mishkah.t(db, 'filter.all.categories')
          ])
        ].concat(
          categories.map(function(cat) {
            return D.Inputs.Option({
              attrs: {
                value: cat.category_id,
                selected: db.filters?.category === cat.category_id
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
          D.Inputs.Option({ attrs: { value: '' } }, [
            Mishkah.t(db, 'filter.all.conditions')
          ]),
          D.Inputs.Option({
            attrs: {
              value: 'new',
              selected: db.filters?.condition === 'new'
            }
          }, [Mishkah.t(db, 'product.condition.new')]),
          D.Inputs.Option({
            attrs: {
              value: 'used',
              selected: db.filters?.condition === 'used'
            }
          }, [Mishkah.t(db, 'product.condition.used')])
        ])
      ]),

      // Products grid
      D.Containers.Div({ attrs: { class: 'products-grid' } },
        products.length > 0
          ? products.map(function(product) {
              return renderProductCard(db, D, product);
            })
          : [D.Text.P({ attrs: { class: 'empty-message' } }, [
              Mishkah.t(db, 'marketplace.empty')
            ])]
      )
    ]);
  }

  /**
   * Render service card
   */
  function renderServiceCard(db, D, service) {
    return D.Containers.Div({
      attrs: {
        class: 'service-card',
        key: service.service_id,
        'data-m-key': 'service-' + service.service_id
      }
    }, [
      D.Containers.Div({ attrs: { class: 'service-content' } }, [
        D.Text.H4({ attrs: { class: 'service-title' } }, [service.title]),
        D.Text.P({ attrs: { class: 'service-description' } }, [
          service.description || ''
        ]),
        D.Containers.Div({ attrs: { class: 'service-meta' } }, [
          D.Text.Span({ attrs: { class: 'service-price' } }, [
            String(service.price_from) + ' - ' + String(service.price_to) + ' ' +
            Mishkah.t(db, 'currency.sar')
          ]),
          D.Text.Span({ attrs: { class: 'service-location' } }, [
            service.city || ''
          ])
        ])
      ]),
      D.Containers.Div({ attrs: { class: 'service-actions' } }, [
        D.Forms.Button(
          { attrs: {
            'data-m-gkey': 'view-service',
            'data-service-id': service.service_id,
            class: 'btn-secondary'
          } },
          [Mishkah.t(db, 'btn.view')]
        )
      ])
    ]);
  }

  /**
   * Render services section
   */
  function renderServices(db, D) {
    var services = getFilteredServices(db);
    var categories = appData.categories.filter(function(cat) {
      return cat.type === 'service';
    });

    return D.Containers.Div({ attrs: { class: 'section section-services' } }, [
      // Filters
      D.Containers.Div({ attrs: { class: 'filters-bar' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: Mishkah.t(db, 'placeholder.search'),
            'data-m-gkey': 'search-input',
            class: 'search-input',
            value: db.filters?.search || ''
          }
        }, []),

        D.Inputs.Select({
          attrs: {
            'data-m-gkey': 'category-filter',
            class: 'filter-select'
          }
        }, [
          D.Inputs.Option({ attrs: { value: '' } }, [
            Mishkah.t(db, 'filter.all.categories')
          ])
        ].concat(
          categories.map(function(cat) {
            return D.Inputs.Option({
              attrs: {
                value: cat.category_id,
                selected: db.filters?.category === cat.category_id
              }
            }, [cat.name]);
          })
        ))
      ]),

      // Services list
      D.Containers.Div({ attrs: { class: 'services-list' } },
        services.length > 0
          ? services.map(function(service) {
              return renderServiceCard(db, D, service);
            })
          : [D.Text.P({ attrs: { class: 'empty-message' } }, [
              Mishkah.t(db, 'services.empty')
            ])]
      )
    ]);
  }

  /**
   * Render wiki article item
   */
  function renderArticleItem(db, D, article) {
    return D.Containers.Div({
      attrs: {
        class: 'article-item',
        key: article.article_id,
        'data-m-key': 'article-' + article.article_id
      }
    }, [
      D.Containers.Div({ attrs: { class: 'article-content' } }, [
        D.Text.H4({ attrs: { class: 'article-title' } }, [article.title]),
        D.Text.P({ attrs: { class: 'article-summary' } }, [
          article.summary || ''
        ]),
        D.Containers.Div({ attrs: { class: 'article-meta' } }, [
          D.Text.Span({ attrs: { class: 'article-views' } }, [
            String(article.view_count || 0) + ' ' + Mishkah.t(db, 'wiki.views')
          ])
        ])
      ]),
      D.Forms.Button(
        { attrs: {
          'data-m-gkey': 'view-article',
          'data-article-id': article.article_id,
          class: 'btn-link'
        } },
        [Mishkah.t(db, 'btn.read')]
      )
    ]);
  }

  /**
   * Render knowledge (wiki) section
   */
  function renderKnowledge(db, D) {
    var articles = getWikiArticles(db);

    return D.Containers.Div({ attrs: { class: 'section section-knowledge' } }, [
      D.Text.H2({}, [Mishkah.t(db, 'knowledge.title')]),
      D.Text.P({ attrs: { class: 'section-subtitle' } }, [
        Mishkah.t(db, 'knowledge.subtitle')
      ]),

      // Search
      D.Containers.Div({ attrs: { class: 'search-bar' } }, [
        D.Inputs.Input({
          attrs: {
            type: 'text',
            placeholder: Mishkah.t(db, 'placeholder.search.articles'),
            'data-m-gkey': 'search-input',
            class: 'search-input'
          }
        }, [])
      ]),

      // Articles list
      D.Containers.Div({ attrs: { class: 'articles-list' } },
        articles.length > 0
          ? articles.map(function(article) {
              return renderArticleItem(db, D, article);
            })
          : [D.Text.P({ attrs: { class: 'empty-message' } }, [
              Mishkah.t(db, 'knowledge.empty')
            ])]
      )
    ]);
  }

  /**
   * Render bottom navigation
   */
  function renderBottomNav(db, D) {
    var currentSection = getActiveSection(db);

    return D.Containers.Nav({ attrs: { class: 'bottom-nav' } }, [
      // Home
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-home',
          class: 'nav-item' + (currentSection === 'home' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🏠']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [
          Mishkah.t(db, 'nav.home')
        ])
      ]),

      // Marketplace
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-marketplace',
          class: 'nav-item' + (currentSection === 'marketplace' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🛒']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [
          Mishkah.t(db, 'nav.marketplace')
        ])
      ]),

      // Services
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-services',
          class: 'nav-item' + (currentSection === 'services' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['🔧']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [
          Mishkah.t(db, 'nav.services')
        ])
      ]),

      // Knowledge
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-knowledge',
          class: 'nav-item' + (currentSection === 'knowledge' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['📚']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [
          Mishkah.t(db, 'nav.knowledge')
        ])
      ]),

      // Profile
      D.Forms.Button({
        attrs: {
          'data-m-gkey': 'nav-profile',
          class: 'nav-item' + (currentSection === 'profile' ? ' active' : '')
        }
      }, [
        D.Text.Span({ attrs: { class: 'nav-icon' } }, ['👤']),
        D.Text.Span({ attrs: { class: 'nav-label' } }, [
          Mishkah.t(db, 'nav.profile')
        ])
      ])
    ]);
  }

  /**
   * Main body function - render entire app
   */
  function renderBody(db, D) {
    // Show loading state
    if (!db.dataLoaded) {
      return renderLoading(db, D);
    }

    // Show error state
    if (db.dataError) {
      return renderError(db, D);
    }

    var currentSection = getActiveSection(db);
    var sectionView;

    switch (currentSection) {
      case 'marketplace':
        sectionView = renderMarketplace(db, D);
        break;
      case 'services':
        sectionView = renderServices(db, D);
        break;
      case 'knowledge':
        sectionView = renderKnowledge(db, D);
        break;
      case 'profile':
        sectionView = D.Containers.Div({ attrs: { class: 'section' } }, [
          D.Text.H2({}, [Mishkah.t(db, 'nav.profile')])
        ]);
        break;
      case 'home':
      default:
        sectionView = renderHome(db, D);
    }

    return D.Containers.Div({ attrs: { class: 'app-container' } }, [
      renderHeader(db, D),
      D.Containers.Main({ attrs: { class: 'app-main' } }, [
        sectionView
      ]),
      renderBottomNav(db, D)
    ]);
  }

  // ================== EVENT HANDLERS (ORDERS) ==================

  var orders = {
    // Navigation handlers
    'nav.home': {
      on: ['click'],
      gkeys: ['nav-home'],
      handler: function(event, ctx) {
        ctx.setState({ currentSection: 'home' });
      }
    },

    'nav.marketplace': {
      on: ['click'],
      gkeys: ['nav-marketplace'],
      handler: function(event, ctx) {
        ctx.setState({ currentSection: 'marketplace' });
      }
    },

    'nav.services': {
      on: ['click'],
      gkeys: ['nav-services'],
      handler: function(event, ctx) {
        ctx.setState({ currentSection: 'services' });
      }
    },

    'nav.knowledge': {
      on: ['click'],
      gkeys: ['nav-knowledge'],
      handler: function(event, ctx) {
        ctx.setState({ currentSection: 'knowledge' });
      }
    },

    'nav.profile': {
      on: ['click'],
      gkeys: ['nav-profile'],
      handler: function(event, ctx) {
        ctx.setState({ currentSection: 'profile' });
      }
    },

    // Theme toggle
    'toggle.theme': {
      on: ['click'],
      gkeys: ['toggle-theme'],
      handler: function(event, ctx) {
        var state = ctx.getState();
        var newTheme = state.theme === 'light' ? 'dark' : 'light';

        // Update state
        ctx.setState({ theme: newTheme });

        // Update DOM
        document.documentElement.setAttribute('data-theme', newTheme);

        // Store preference
        try {
          localStorage.setItem('sbn-theme', newTheme);
        } catch (e) {
          console.warn('Could not save theme preference');
        }
      }
    },

    // Language toggle
    'toggle.lang': {
      on: ['click'],
      gkeys: ['toggle-lang'],
      handler: function(event, ctx) {
        var state = ctx.getState();
        var newLang = state.lang === 'ar' ? 'en' : 'ar';
        var newDir = newLang === 'ar' ? 'rtl' : 'ltr';

        // Update state
        ctx.setState({ lang: newLang, dir: newDir });

        // Update DOM
        document.documentElement.setAttribute('lang', newLang);
        document.documentElement.setAttribute('dir', newDir);

        // Store preference
        try {
          localStorage.setItem('sbn-lang', newLang);
        } catch (e) {
          console.warn('Could not save language preference');
        }
      }
    },

    // Search input
    'search.input': {
      on: ['input'],
      gkeys: ['search-input'],
      handler: function(event, ctx) {
        var searchValue = event.target.value;
        ctx.setState(function(state) {
          return {
            filters: Object.assign({}, state.filters || {}, {
              search: searchValue
            })
          };
        });
      }
    },

    // Category filter
    'filter.category': {
      on: ['change'],
      gkeys: ['category-filter'],
      handler: function(event, ctx) {
        var categoryValue = event.target.value;
        ctx.setState(function(state) {
          return {
            filters: Object.assign({}, state.filters || {}, {
              category: categoryValue
            })
          };
        });
      }
    },

    // Condition filter
    'filter.condition': {
      on: ['change'],
      gkeys: ['condition-filter'],
      handler: function(event, ctx) {
        var conditionValue = event.target.value;
        ctx.setState(function(state) {
          return {
            filters: Object.assign({}, state.filters || {}, {
              condition: conditionValue
            })
          };
        });
      }
    },

    // View product
    'view.product': {
      on: ['click'],
      gkeys: ['view-product'],
      handler: function(event, ctx) {
        var productId = event.target.getAttribute('data-product-id');
        console.log('View product:', productId);
        // TODO: Implement product detail view
        alert('Product detail view - ID: ' + productId);
      }
    },

    // View service
    'view.service': {
      on: ['click'],
      gkeys: ['view-service'],
      handler: function(event, ctx) {
        var serviceId = event.target.getAttribute('data-service-id');
        console.log('View service:', serviceId);
        // TODO: Implement service detail view
        alert('Service detail view - ID: ' + serviceId);
      }
    },

    // View article
    'view.article': {
      on: ['click'],
      gkeys: ['view-article'],
      handler: function(event, ctx) {
        var articleId = event.target.getAttribute('data-article-id');
        console.log('View article:', articleId);
        // TODO: Implement article detail view
        alert('Article detail view - ID: ' + articleId);
      }
    },

    // Retry loading data
    'retry.load': {
      on: ['click'],
      gkeys: ['retry'],
      handler: function(event, ctx) {
        ctx.setState({ dataLoaded: false, dataError: null });
        initApp();
      }
    }
  };

  // ================== INITIALIZATION ==================

  /**
   * Initialize the application
   */
  async function initApp() {
    console.log('Initializing Mostamal Hawa PWA...');

    try {
      // Create store instance
      if (!store) {
        store = Mishkah.Store.createStore({
          branchId: BRANCH_ID,
          moduleId: MODULE_ID,
          wsUrl: 'ws://' + window.location.host
        });

        // Connect to backend
        await store.connect();
        console.log('Connected to backend store');
      }

      // Load all data
      var loadSuccess = await loadAppData();

      if (!loadSuccess) {
        throw new Error(appData.error || 'Failed to load data');
      }

      // Build i18n dictionary from loaded labels
      var i18nDict = buildI18nDict(appData.uiLabels);
      console.log('Built i18n dictionary with', Object.keys(i18nDict).length, 'keys');

      // Get saved preferences
      var savedTheme = 'light';
      var savedLang = 'ar';
      try {
        savedTheme = localStorage.getItem('sbn-theme') || 'light';
        savedLang = localStorage.getItem('sbn-lang') || 'ar';
      } catch (e) {
        console.warn('Could not read preferences from localStorage');
      }

      // Apply theme and language to DOM
      document.documentElement.setAttribute('data-theme', savedTheme);
      document.documentElement.setAttribute('lang', savedLang);
      document.documentElement.setAttribute('dir', savedLang === 'ar' ? 'rtl' : 'ltr');

      // Set body function
      Mishkah.app.setBody(renderBody);

      // Create and mount app
      var app = Mishkah.app.createApp(
        // Initial state
        {
          dataLoaded: true,
          dataError: null,
          currentSection: 'home',
          theme: savedTheme,
          lang: savedLang,
          dir: savedLang === 'ar' ? 'rtl' : 'ltr',
          i18n: i18nDict,
          filters: {
            search: '',
            category: '',
            condition: ''
          }
        },
        // Orders (event handlers)
        orders
      );

      // Mount to DOM
      app.mount('#app');

      console.log('Mostamal Hawa PWA initialized successfully!');

    } catch (err) {
      console.error('Failed to initialize app:', err);

      // Show error state
      Mishkah.app.setBody(renderBody);
      var app = Mishkah.app.createApp(
        {
          dataLoaded: false,
          dataError: true,
          errorMessage: err.message,
          theme: 'light',
          lang: 'ar',
          dir: 'rtl',
          i18n: {}
        },
        orders
      );
      app.mount('#app');
    }
  }

  // ================== START APP ==================

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
