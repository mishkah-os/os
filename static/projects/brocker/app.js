/**
 * Brocker App - Real Estate Listings Platform
 * Clean rebuild using Auto-Flattening translation system
 * Backend automatically merges *_lang tables based on lang parameter
 * Frontend uses data directly without translation logic
 */

(function () {
  'use strict';

  // ============================================================================
  // SECTION 1: CONFIGURATION & CONSTANTS
  // ============================================================================

  var M = window.Mishkah;
  if (!M) throw new Error('Mishkah not loaded');

  var BRANCH_ID = 'aqar';
  var MODULE_ID = 'brocker';

  // Required tables (NO ui_labels - backend handles all translations)
  var REQUIRED_TABLES = new Set([
    'app_settings',
    'hero_slides',
    'regions',
    'unit_types',
    'listings',
    'brokers',
    'units',
    'unit_media',
    'inquiries'
  ]);

  // Static UI labels (NOT from database)
  var UI_LABELS = {
    ar: {
      // Navigation
      home: 'الرئيسية',
      brokers: 'الوسطاء',
      dashboard: 'لوحة التحكم',
      inbox: 'الرسائل',
      profile: 'الملف الشخصي',
      settings: 'الإعدادات',
      logout: 'تسجيل خروج',

      // Search & Filters
      search: 'بحث',
      filter: 'تصفية',
      reset: 'إعادة ضبط',
      all_regions: 'كل المناطق',
      all_types: 'كل الأنواع',
      for_sale: 'للبيع',
      for_rent: 'للإيجار',

      // Actions
      submit: 'إرسال',
      cancel: 'إلغاء',
      save: 'حفظ',
      delete: 'حذف',
      edit: 'تعديل',
      view: 'عرض',
      close: 'إغلاق',
      back: 'رجوع',

      // Common
      loading: 'جاري التحميل...',
      error: 'خطأ',
      success: 'نجح',
      no_results: 'لا توجد نتائج',
      required: 'مطلوب'
    },
    en: {
      // Navigation
      home: 'Home',
      brokers: 'Brokers',
      dashboard: 'Dashboard',
      inbox: 'Inbox',
      profile: 'Profile',
      settings: 'Settings',
      logout: 'Logout',

      // Search & Filters
      search: 'Search',
      filter: 'Filter',
      reset: 'Reset',
      all_regions: 'All Regions',
      all_types: 'All Types',
      for_sale: 'For Sale',
      for_rent: 'For Rent',

      // Actions
      submit: 'Submit',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      view: 'View',
      close: 'Close',
      back: 'Back',

      // Common
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      no_results: 'No results',
      required: 'Required'
    }
  };

  // Simple UI label translation (NOT for data)
  function t(key, fallback) {
    var lang = activeEnv().lang || 'ar';
    return (UI_LABELS[lang] && UI_LABELS[lang][key]) || fallback || key;
  }

  // ============================================================================
  // SECTION 2: HELPER FUNCTIONS
  // ============================================================================

  // Get active environment from global state
  function activeEnv() {
    return (window._brocker_app && window._brocker_app.getState().env) || { lang: 'ar', dir: 'rtl', theme: 'dark' };
  }

  // Normalize media URL
  function normalizeMediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/')) return window.basedomain + url;
    return window.basedomain + '/' + url;
  }

  // Format price with currency and locale
  function formatPrice(amount, currency, period, lang) {
    if (amount == null) return '';
    lang = lang || activeEnv().lang || 'ar';

    var formatted = '';
    if (lang === 'ar') {
      formatted = new Intl.NumberFormat('ar-EG').format(amount);
    } else {
      formatted = new Intl.NumberFormat('en-US').format(amount);
    }

    var currencyLabel = currency || 'EGP';
    var periodLabel = '';
    if (period === 'monthly') periodLabel = lang === 'ar' ? '/شهر' : '/month';
    if (period === 'yearly') periodLabel = lang === 'ar' ? '/سنة' : '/year';

    return currencyLabel + ' ' + formatted + periodLabel;
  }

  // Format date
  function formatDate(dateStr, lang) {
    if (!dateStr) return '';
    lang = lang || activeEnv().lang || 'ar';

    var date = new Date(dateStr);
    if (lang === 'ar') {
      return date.toLocaleDateString('ar-EG');
    }
    return date.toLocaleDateString('en-US');
  }

  // Validate Egyptian phone number
  function validateEgyptianPhone(phone) {
    if (!phone) return false;
    var cleaned = phone.replace(/\D/g, '');
    return /^(01[0-2]|015)\d{8}$/.test(cleaned);
  }

  // Index array by field
  function indexBy(arr, field) {
    var result = {};
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      result[item[field]] = item;
    }
    return result;
  }

  // Find by ID
  function findById(arr, id) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
    }
    return null;
  }

  // Extract unique values from array
  function uniqueValues(arr, field) {
    var seen = {};
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      var val = arr[i][field];
      if (val && !seen[val]) {
        seen[val] = true;
        result.push(val);
      }
    }
    return result;
  }

  // Filter listings based on criteria
  function filterListings(listingModels, filters) {
    return listingModels.filter(function (model) {
      if (filters.regionId && model.listing.region_id !== filters.regionId) return false;
      if (filters.unitTypeId && model.unit && model.unit.unit_type_id !== filters.unitTypeId) return false;
      if (filters.listingType && model.listing.listing_type !== filters.listingType) return false;
      return true;
    });
  }

  // Group array by field
  function groupBy(arr, field) {
    var result = {};
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      var key = item[field];
      if (!result[key]) result[key] = [];
      result[key].push(item);
    }
    return result;
  }

  // Build listing view models (join all related data)
  function buildListingModels(db) {
    var listings = db.data.listings || [];
    var units = indexBy(db.data.units || [], 'id');
    var brokers = indexBy(db.data.brokers || [], 'id');
    var regions = indexBy(db.data.regions || [], 'id');
    var unitTypes = indexBy(db.data.unitTypes || [], 'id');
    var mediaByUnit = groupBy(db.data.unitMedia || [], 'unit_id');

    var models = listings.map(function (listing) {
      var unit = listing.unit_id ? units[listing.unit_id] : null;
      var broker = listing.broker_id ? brokers[listing.broker_id] : null;
      var region = listing.region_id ? regions[listing.region_id] : null;
      var unitType = unit && unit.unit_type_id ? unitTypes[unit.unit_type_id] : null;

      // Get media for this unit
      var media = unit ? (mediaByUnit[unit.id] || []) : [];
      media.sort(function (a, b) { return (a.priority || 999) - (b.priority || 999); });

      // Select cover image
      var coverImage = null;
      for (var i = 0; i < media.length; i++) {
        if (media[i].media_type === 'image') {
          coverImage = media[i];
          break;
        }
      }

      return {
        listing: listing,
        unit: unit,
        broker: broker,
        region: region,
        unitType: unitType,
        media: media,
        coverImage: coverImage
      };
    });

    // Sort: featured first, then by created_at (newest first)
    models.sort(function (a, b) {
      var aFeatured = a.listing.featured_order || 999;
      var bFeatured = b.listing.featured_order || 999;
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;

      var aDate = a.listing.created_at || '';
      var bDate = b.listing.created_at || '';
      return bDate.localeCompare(aDate);
    });

    return models;
  }

  // ============================================================================
  // SECTION 3: STATE MANAGEMENT
  // ============================================================================

  // Set language and reload data
  function setEnvLanguage(app, newLang) {
    var currentEnv = app.getState().env;
    if (currentEnv.lang === newLang) return;

    // Update env
    app.setState(function (prev) {
      return {
        env: {
          theme: prev.env.theme,
          lang: newLang,
          dir: newLang === 'ar' ? 'rtl' : 'ltr'
        },
        state: {
          ...prev.state,
          loading: true
        }
      };
    });

    // Reload data with new language
    reloadDataWithLanguage(app, newLang);
  }

  // Reload data from backend with specific language
  function reloadDataWithLanguage(app, lang) {
    if (!window._brocker_realtime_connection) {
      console.warn('No realtime connection available');
      return;
    }

    var conn = window._brocker_realtime_connection;

    // Disconnect current connection
    if (conn.disconnect && typeof conn.disconnect === 'function') {
      conn.disconnect();
    }

    // Clear ready tables
    app.setState(function (prev) {
      return {
        state: {
          ...prev.state,
          readyTables: [],
          loading: true
        }
      };
    });

    // Reconnect with new language
    setTimeout(function () {
      bootstrapRealtime(app, lang);
    }, 100);
  }

  // Commit table data to state
  function commitTable(app, tableName, rows) {
    if (!tableName || !Array.isArray(rows)) return;

    app.setState(function (prev) {
      var nextData = {};
      for (var key in prev.data) {
        nextData[key] = prev.data[key];
      }

      var dataKey = tableToDataKey(tableName);

      // Special handling for app_settings (single object, not array)
      if (tableName === 'app_settings') {
        nextData[dataKey] = rows.length > 0 ? rows[0] : {};
      } else {
        nextData[dataKey] = rows;
      }

      var nextReadyTables = prev.state.readyTables.slice();
      if (!nextReadyTables.includes(tableName)) {
        nextReadyTables.push(tableName);
      }

      var allReady = true;
      REQUIRED_TABLES.forEach(function (t) {
        if (!nextReadyTables.includes(t)) allReady = false;
      });

      return {
        data: nextData,
        state: {
          ...prev.state,
          readyTables: nextReadyTables,
          loading: !allReady
        }
      };
    });
  }

  // Map table name to data key (camelCase)
  function tableToDataKey(tableName) {
    var map = {
      'app_settings': 'appSettings',
      'hero_slides': 'heroSlides',
      'regions': 'regions',
      'unit_types': 'unitTypes',
      'listings': 'listings',
      'brokers': 'brokers',
      'units': 'units',
      'unit_media': 'unitMedia',
      'unit_layouts': 'unitLayouts',
      'feature_values': 'featureValues',
      'unit_features': 'unitFeatures',
      'inquiries': 'inquiries',
      'notifications': 'notifications',
      'users': 'users'
    };
    return map[tableName] || tableName;
  }

  // ============================================================================
  // SECTION 4: UI COMPONENTS
  // ============================================================================

  // Preferences Bar (Top navbar with theme/lang toggles)
  function PreferencesBar(db, D) {
    var env = db.env;
    var lang = env.lang || 'ar';

    return D.Containers.Header({ attrs: { class: 'bg-base-800 border-b border-base-700 px-4 py-3' } }, [
      D.Containers.Div({ attrs: { class: 'flex items-center justify-between max-w-7xl mx-auto' } }, [
        // Brand
        D.Text.Span({ attrs: { class: 'text-xl font-bold text-primary-400' } }, [
          db.data.appSettings.brand_name || 'Brocker'
        ]),

        // Controls
        D.Containers.Div({ attrs: { class: 'flex items-center gap-3' } }, [
          // Theme toggle
          D.Forms.Button({
            attrs: {
              class: 'p-2 rounded-lg hover:bg-base-700 transition',
              'data-m-gkey': 'toggle-theme',
              'aria-label': 'Toggle theme'
            }
          }, [
            D.Text.Span({}, [env.theme === 'dark' ? '🌙' : '☀️'])
          ]),

          // Language toggle
          D.Forms.Button({
            attrs: {
              class: 'px-3 py-2 rounded-lg hover:bg-base-700 transition text-sm font-medium',
              'data-m-gkey': 'toggle-lang'
            }
          }, [
            D.Text.Span({}, [lang === 'ar' ? 'EN' : 'ع'])
          ]),

          // Profile menu (if authenticated)
          db.state.auth && db.state.auth.isAuthenticated
            ? D.Containers.Div({ attrs: { class: 'relative' } }, [
                D.Forms.Button({
                  attrs: {
                    class: 'p-2 rounded-lg hover:bg-base-700 transition',
                    'data-m-gkey': 'toggle-profile'
                  }
                }, [
                  D.Text.Span({}, ['👤'])
                ]),

                // Profile dropdown
                db.state.showProfileMenu
                  ? D.Containers.Div({
                      attrs: {
                        class: 'absolute top-full mt-2 ' + (lang === 'ar' ? 'left-0' : 'right-0') + ' bg-base-800 border border-base-700 rounded-lg shadow-lg min-w-48 z-50'
                      }
                    }, [
                      D.Forms.Button({
                        attrs: {
                          class: 'w-full text-start px-4 py-2 hover:bg-base-700 transition',
                          'data-m-gkey': 'logout'
                        }
                      }, [
                        D.Text.Span({}, [t('logout')])
                      ])
                    ])
                  : null
              ])
            : D.Forms.Button({
                attrs: {
                  class: 'px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-sm font-medium transition',
                  'data-m-gkey': 'show-auth'
                }
              }, [
                D.Text.Span({}, [lang === 'ar' ? 'تسجيل دخول' : 'Login'])
              ])
        ])
      ])
    ]);
  }

  // Search Panel (3-filter search)
  function SearchPanel(db, D) {
    var lang = db.env.lang || 'ar';
    var filters = db.state.filters || {};
    var regions = db.data.regions || [];
    var unitTypes = db.data.unitTypes || [];

    return D.Containers.Section({ attrs: { class: 'bg-base-800 px-4 py-6' } }, [
      D.Containers.Div({ attrs: { class: 'max-w-7xl mx-auto' } }, [
        D.Forms.Form({
          attrs: {
            class: 'grid grid-cols-1 md:grid-cols-4 gap-4',
            'data-m-gkey': 'search-form'
          }
        }, [
          // Region filter
          D.Inputs.Select({
            attrs: {
              class: 'px-4 py-2 bg-base-900 border border-base-700 rounded-lg focus:border-primary-500 focus:outline-none',
              'data-m-gkey': 'filter-region',
              name: 'regionId'
            }
          }, [
            D.Inputs.Option({ attrs: { value: '' } }, [t('all_regions')]),
            ...regions.map(function (r) {
              return D.Inputs.Option({
                attrs: {
                  value: r.id,
                  selected: filters.regionId === r.id
                }
              }, [r.name]); // ✅ Direct access - backend already translated
            })
          ]),

          // Unit type filter
          D.Inputs.Select({
            attrs: {
              class: 'px-4 py-2 bg-base-900 border border-base-700 rounded-lg focus:border-primary-500 focus:outline-none',
              'data-m-gkey': 'filter-unit-type',
              name: 'unitTypeId'
            }
          }, [
            D.Inputs.Option({ attrs: { value: '' } }, [t('all_types')]),
            ...unitTypes.map(function (ut) {
              return D.Inputs.Option({
                attrs: {
                  value: ut.id,
                  selected: filters.unitTypeId === ut.id
                }
              }, [ut.name]); // ✅ Direct access - backend already translated
            })
          ]),

          // Listing type filter
          D.Inputs.Select({
            attrs: {
              class: 'px-4 py-2 bg-base-900 border border-base-700 rounded-lg focus:border-primary-500 focus:outline-none',
              'data-m-gkey': 'filter-listing-type',
              name: 'listingType'
            }
          }, [
            D.Inputs.Option({ attrs: { value: '' } }, [t('all_types')]),
            D.Inputs.Option({
              attrs: {
                value: 'sale',
                selected: filters.listingType === 'sale'
              }
            }, [t('for_sale')]),
            D.Inputs.Option({
              attrs: {
                value: 'rent',
                selected: filters.listingType === 'rent'
              }
            }, [t('for_rent')])
          ]),

          // Reset button
          D.Forms.Button({
            attrs: {
              class: 'px-6 py-2 bg-base-700 hover:bg-base-600 rounded-lg font-medium transition',
              'data-m-gkey': 'reset-filters',
              type: 'button'
            }
          }, [
            D.Text.Span({}, [t('reset')])
          ])
        ])
      ])
    ]);
  }

  // Listing Card
  function ListingCard(model, D) {
    var lang = activeEnv().lang || 'ar';
    var listing = model.listing;
    var unit = model.unit;
    var coverImage = model.coverImage;
    var region = model.region;
    var unitType = model.unitType;

    var imageUrl = coverImage ? normalizeMediaUrl(coverImage.url) : '/static/images/placeholder.jpg';
    var headline = listing.headline || ''; // ✅ Direct access - backend already translated
    var price = unit ? formatPrice(unit.price, unit.currency, listing.listing_type === 'rent' ? 'monthly' : null, lang) : '';
    var regionName = region ? region.name : ''; // ✅ Direct access
    var typeName = unitType ? unitType.name : ''; // ✅ Direct access

    return D.Containers.Div({
      attrs: {
        class: 'bg-base-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition cursor-pointer',
        'data-m-key': 'listing-' + listing.id
      }
    }, [
      // Image
      D.Media.Img({
        attrs: {
          src: imageUrl,
          alt: headline,
          class: 'w-full h-48 object-cover'
        }
      }, []),

      // Content
      D.Containers.Div({ attrs: { class: 'p-4' } }, [
        // Headline
        D.Text.H3({ attrs: { class: 'text-lg font-bold mb-2' } }, [headline]),

        // Region & Type
        D.Text.P({ attrs: { class: 'text-sm text-base-400 mb-2' } }, [
          regionName + (regionName && typeName ? ' • ' : '') + typeName
        ]),

        // Price
        price
          ? D.Text.P({ attrs: { class: 'text-xl font-bold text-primary-400' } }, [price])
          : null
      ])
    ]);
  }

  // Latest Listings Grid
  function LatestListingsGrid(db, D) {
    var models = buildListingModels(db);
    var filters = db.state.filters || {};
    var filtered = filterListings(models, filters);

    if (filtered.length === 0) {
      return D.Containers.Section({ attrs: { class: 'px-4 py-12 text-center' } }, [
        D.Text.P({ attrs: { class: 'text-base-500' } }, [t('no_results')])
      ]);
    }

    return D.Containers.Section({ attrs: { class: 'px-4 py-8' } }, [
      D.Containers.Div({ attrs: { class: 'max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' } },
        filtered.map(function (model) {
          return ListingCard(model, D);
        })
      )
    ]);
  }

  // ============================================================================
  // SECTION 5: MAIN VIEWS
  // ============================================================================

  // Home View
  function HomeView(db, D) {
    return D.Containers.Main({}, [
      SearchPanel(db, D),
      LatestListingsGrid(db, D)
    ]);
  }

  // Listing Detail View
  function ListingDetailView(db, D) {
    var listingId = db.state.selectedListingId;
    if (!listingId) return HomeView(db, D);

    var models = buildListingModels(db);
    var model = models.find(function (m) { return m.listing.id === listingId; });
    if (!model) return HomeView(db, D);

    var listing = model.listing;
    var unit = model.unit;
    var broker = model.broker;

    return D.Containers.Main({ attrs: { class: 'px-4 py-8' } }, [
      D.Containers.Div({ attrs: { class: 'max-w-4xl mx-auto' } }, [
        // Back button
        D.Forms.Button({
          attrs: {
            class: 'mb-4 px-4 py-2 bg-base-800 hover:bg-base-700 rounded-lg',
            'data-m-gkey': 'back-to-home'
          }
        }, [t('back')]),

        // Title
        D.Text.H1({ attrs: { class: 'text-3xl font-bold mb-4' } }, [
          listing.headline || '' // ✅ Direct access
        ]),

        // Gallery (simplified)
        D.Containers.Div({ attrs: { class: 'mb-6' } }, [
          model.coverImage
            ? D.Media.Img({
                attrs: {
                  src: normalizeMediaUrl(model.coverImage.url),
                  alt: listing.headline,
                  class: 'w-full h-96 object-cover rounded-lg'
                }
              }, [])
            : null
        ]),

        // Description
        listing.description
          ? D.Text.P({ attrs: { class: 'text-base-300 mb-6' } }, [
              listing.description // ✅ Direct access
            ])
          : null,

        // Broker info (if available)
        broker
          ? D.Containers.Div({ attrs: { class: 'bg-base-800 p-4 rounded-lg' } }, [
              D.Text.P({ attrs: { class: 'font-medium mb-2' } }, [
                broker.name || '' // ✅ Direct access
              ]),
              broker.phone
                ? D.Text.P({ attrs: { class: 'text-sm text-base-400' } }, [broker.phone])
                : null
            ])
          : null
      ])
    ]);
  }

  // Brokers View (placeholder)
  function BrokersView(db, D) {
    return D.Containers.Main({ attrs: { class: 'px-4 py-8' } }, [
      D.Text.H1({ attrs: { class: 'text-2xl font-bold mb-6' } }, [t('brokers')])
    ]);
  }

  // Dashboard View (placeholder)
  function DashboardView(db, D) {
    return D.Containers.Main({ attrs: { class: 'px-4 py-8' } }, [
      D.Text.H1({ attrs: { class: 'text-2xl font-bold mb-6' } }, [t('dashboard')])
    ]);
  }

  // Inbox View (placeholder)
  function InboxView(db, D) {
    return D.Containers.Main({ attrs: { class: 'px-4 py-8' } }, [
      D.Text.H1({ attrs: { class: 'text-2xl font-bold mb-6' } }, [t('inbox')])
    ]);
  }

  // ============================================================================
  // SECTION 6: BODY FUNCTION
  // ============================================================================

  M.app.setBody(function (db, D) {
    // Loading state
    if (db.state.loading) {
      return D.Containers.Div({ attrs: { class: 'flex items-center justify-center min-h-screen' } }, [
        D.Text.P({ attrs: { class: 'text-xl' } }, [t('loading')])
      ]);
    }

    // Error state
    if (db.state.error) {
      return D.Containers.Div({ attrs: { class: 'flex items-center justify-center min-h-screen' } }, [
        D.Text.P({ attrs: { class: 'text-xl text-red-500' } }, [db.state.error])
      ]);
    }

    // Main layout
    var activeView = db.state.activeView || 'home';
    var viewContent;

    if (activeView === 'home') viewContent = HomeView(db, D);
    else if (activeView === 'listing') viewContent = ListingDetailView(db, D);
    else if (activeView === 'brokers') viewContent = BrokersView(db, D);
    else if (activeView === 'dashboard') viewContent = DashboardView(db, D);
    else if (activeView === 'inbox') viewContent = InboxView(db, D);
    else viewContent = HomeView(db, D);

    return D.Containers.Div({
      attrs: {
        class: 'min-h-screen bg-base-900 text-base-100',
        dir: db.env.dir || 'rtl'
      }
    }, [
      PreferencesBar(db, D),
      viewContent
    ]);
  });

  // ============================================================================
  // SECTION 7: EVENT HANDLERS (ORDERS)
  // ============================================================================

  var orders = {
    // Theme toggle
    'ui.theme.toggle': {
      on: ['click'],
      gkeys: ['toggle-theme'],
      handler: function (event, ctx) {
        ctx.setState(function (prev) {
          var newTheme = prev.env.theme === 'dark' ? 'light' : 'dark';
          return {
            env: {
              theme: newTheme,
              lang: prev.env.lang,
              dir: prev.env.dir
            }
          };
        });
      }
    },

    // Language toggle
    'ui.lang.toggle': {
      on: ['click'],
      gkeys: ['toggle-lang'],
      handler: function (event, ctx) {
        var app = ctx;
        var currentLang = app.getState().env.lang || 'ar';
        var newLang = currentLang === 'ar' ? 'en' : 'ar';
        setEnvLanguage(app, newLang);
      }
    },

    // Profile menu toggle
    'ui.profile.toggle': {
      on: ['click'],
      gkeys: ['toggle-profile'],
      handler: function (event, ctx) {
        ctx.setState(function (prev) {
          return {
            state: {
              ...prev.state,
              showProfileMenu: !prev.state.showProfileMenu
            }
          };
        });
      }
    },

    // Show auth modal
    'ui.auth.show': {
      on: ['click'],
      gkeys: ['show-auth'],
      handler: function (event, ctx) {
        ctx.setState(function (prev) {
          return {
            state: {
              ...prev.state,
              auth: {
                ...prev.state.auth,
                showAuthModal: true
              }
            }
          };
        });
      }
    },

    // Filter change
    'ui.filter.change': {
      on: ['change'],
      gkeys: ['filter-region', 'filter-unit-type', 'filter-listing-type'],
      handler: function (event, ctx) {
        var target = event.target;
        var name = target.name;
        var value = target.value;

        ctx.setState(function (prev) {
          var newFilters = {};
          for (var key in prev.state.filters) {
            newFilters[key] = prev.state.filters[key];
          }
          newFilters[name] = value || null;

          return {
            state: {
              ...prev.state,
              filters: newFilters
            }
          };
        });
      }
    },

    // Reset filters
    'ui.filter.reset': {
      on: ['click'],
      gkeys: ['reset-filters'],
      handler: function (event, ctx) {
        event.preventDefault();
        ctx.setState(function (prev) {
          return {
            state: {
              ...prev.state,
              filters: {}
            }
          };
        });
      }
    },

    // Select listing
    'ui.listing.select': {
      on: ['click'],
      keys: ['listing-*'],
      handler: function (event, ctx) {
        var target = event.target.closest('[data-m-key^="listing-"]');
        if (!target) return;

        var key = target.getAttribute('data-m-key');
        var listingId = key.replace('listing-', '');

        ctx.setState(function (prev) {
          return {
            state: {
              ...prev.state,
              activeView: 'listing',
              selectedListingId: listingId
            }
          };
        });
      }
    },

    // Back to home
    'ui.listing.back': {
      on: ['click'],
      gkeys: ['back-to-home'],
      handler: function (event, ctx) {
        ctx.setState(function (prev) {
          return {
            state: {
              ...prev.state,
              activeView: 'home',
              selectedListingId: null
            }
          };
        });
      }
    }
  };

  // ============================================================================
  // SECTION 8: BOOTSTRAP & INITIALIZATION
  // ============================================================================

  // Bootstrap real-time connection
  function bootstrapRealtime(app, lang) {
    lang = lang || 'ar';

    var conn = window.createDBAuto({
      branchId: BRANCH_ID,
      moduleId: MODULE_ID,
      lang: lang, // ✅ Pass language to backend for Auto-Flattening
      role: 'client',
      autoReconnect: true,
      logger: console
    });

    // Store connection globally
    window._brocker_realtime_connection = conn;

    // Watch all required tables
    REQUIRED_TABLES.forEach(function (tableName) {
      conn.watch(tableName, function (rows) {
        commitTable(app, tableName, rows);
      });
    });

    // Connect
    conn.connect().catch(function (err) {
      console.error('Failed to connect:', err);
      app.setState(function (prev) {
        return {
          state: {
            ...prev.state,
            loading: false,
            error: 'Connection failed: ' + err.message
          }
        };
      });
    });
  }

  // Create and mount app
  function init() {
    var initialState = {
      env: {
        theme: 'dark',
        lang: 'ar',
        dir: 'rtl'
      },
      meta: {
        branchId: BRANCH_ID,
        moduleId: MODULE_ID
      },
      state: {
        loading: true,
        error: null,
        activeView: 'home',
        filters: {},
        selectedListingId: null,
        selectedBrokerId: null,
        readyTables: [],
        showProfileMenu: false,
        auth: {
          isAuthenticated: false,
          user: null,
          showAuthModal: false
        }
      },
      data: {
        appSettings: {},
        heroSlides: [],
        regions: [],
        unitTypes: [],
        listings: [],
        brokers: [],
        units: [],
        unitMedia: [],
        inquiries: []
      }
    };

    var app = M.app.createApp(initialState, orders);

    // Store app globally
    window._brocker_app = app;

    // Mount to DOM
    app.mount('#app');

    // Bootstrap real-time connection
    bootstrapRealtime(app, initialState.env.lang);
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
