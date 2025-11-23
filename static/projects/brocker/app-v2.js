(function () {
  'use strict';

  var global = window;
  var M = global.Mishkah;
  if (!M || !M.DSL) {
    console.error('[Brocker v2] Mishkah core is required.');
    return;
  }

  var D = M.DSL;
  var params = new URLSearchParams(global.location.search || '');
  var BRANCH_ID = params.get('branch') || params.get('branchId') || 'aqar';
  var MODULE_ID = params.get('module') || params.get('moduleId') || 'brocker';

  // ===========================
  // Preferences & State
  // ===========================
  var PREF_KEY = 'brocker:prefs:v2';

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (e) {}
  }

  var prefs = loadPrefs();
  var initialLang = prefs.lang || 'ar';
  var initialDir = prefs.dir || (initialLang === 'ar' ? 'rtl' : 'ltr');
  var initialTheme = prefs.theme || 'dark';

  // Apply to document early
  var root = document.documentElement;
  root.setAttribute('lang', initialLang);
  root.setAttribute('dir', initialDir);
  root.dataset.theme = initialTheme;

  // ===========================
  // Initial Database State
  // ===========================
  var initialDatabase = {
    branchId: BRANCH_ID,
    moduleId: MODULE_ID,
    lang: initialLang,
    dir: initialDir,
    theme: initialTheme,
    loading: true,
    connected: false,
    view: 'home', // home, listing-detail
    selectedListingId: null,
    listings: [],
    regions: [],
    brokers: [],
    units: [],
    unit_types: []
  };

  // ===========================
  // Helper Functions
  // ===========================
  function tw() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  function themed(db, darkClass, lightClass) {
    return db.theme === 'light' ? lightClass : darkClass;
  }

  function syncDocumentEnv(db) {
    root.setAttribute('lang', db.lang);
    root.setAttribute('dir', db.dir);
    root.dataset.theme = db.theme;
  }

  function normalizeMediaUrl(url, fallback) {
    if (url && /^https?:\/\//i.test(url)) return url;
    return fallback || 'https://images.unsplash.com/photo-1582719478239-2f66c2401b1b?auto=format&fit=crop&w=1400&q=80';
  }

  // ===========================
  // UI Components
  // ===========================
  function Header(db) {
    return D.Containers.Header(
      { attrs: { class: tw('sticky top-0 z-50', themed(db, 'bg-slate-900/95 border-b border-slate-800', 'bg-white/95 border-b border-slate-200'), 'backdrop-blur-sm') } },
      [
        D.Containers.Div(
          { attrs: { class: 'container mx-auto px-4 py-4 flex items-center justify-between' } },
          [
            // Logo
            D.Text.H1(
              { attrs: { class: tw('text-2xl font-bold', themed(db, 'text-white', 'text-slate-900')) } },
              ['🏢 Brocker']
            ),

            // Controls
            D.Containers.Div(
              { attrs: { class: 'flex items-center gap-4' } },
              [
                // Language Toggle
                D.Forms.Button(
                  {
                    attrs: {
                      class: tw('px-4 py-2 rounded-lg font-medium transition-colors', themed(db, 'bg-slate-800 text-white hover:bg-slate-700', 'bg-slate-100 text-slate-900 hover:bg-slate-200')),
                      'data-m-gkey': 'toggle-lang'
                    }
                  },
                  [db.lang === 'ar' ? 'EN' : 'AR']
                ),

                // Theme Toggle
                D.Forms.Button(
                  {
                    attrs: {
                      class: tw('px-4 py-2 rounded-lg transition-colors', themed(db, 'bg-slate-800 hover:bg-slate-700', 'bg-slate-100 hover:bg-slate-200')),
                      'data-m-gkey': 'toggle-theme'
                    }
                  },
                  [db.theme === 'dark' ? '☀️' : '🌙']
                )
              ]
            )
          ]
        )
      ]
    );
  }

  function ListingCard(db, listing) {
    if (!listing) return null;

    return D.Containers.Div(
      {
        attrs: {
          class: tw('rounded-xl overflow-hidden shadow-lg transition-transform hover:scale-105 cursor-pointer', themed(db, 'bg-slate-800 border border-slate-700', 'bg-white border border-slate-200')),
          'data-m-key': 'listing-' + listing.id,
          key: listing.id
        }
      },
      [
        // Image
        D.Media.Img({
          attrs: {
            src: normalizeMediaUrl(listing.primary_media_url),
            alt: listing.headline || 'Listing',
            class: 'w-full h-56 object-cover'
          }
        }),

        // Content
        D.Containers.Div(
          { attrs: { class: 'p-6' } },
          [
            // Headline - Direct field access! 🎉
            D.Text.H3(
              { attrs: { class: tw('text-xl font-bold mb-2', themed(db, 'text-white', 'text-slate-900')) } },
              [listing.headline || 'No title']
            ),

            // Excerpt - Direct field access! 🎉
            listing.excerpt
              ? D.Text.P(
                  { attrs: { class: tw('text-sm mb-4 line-clamp-2', themed(db, 'text-slate-300', 'text-slate-600')) } },
                  [listing.excerpt]
                )
              : null,

            // Price
            D.Containers.Div(
              { attrs: { class: 'flex items-center justify-between' } },
              [
                D.Text.Span(
                  { attrs: { class: tw('text-2xl font-bold', themed(db, 'text-emerald-400', 'text-emerald-600')) } },
                  [
                    listing.price_amount
                      ? new Intl.NumberFormat(db.lang === 'ar' ? 'ar-EG' : 'en-US').format(listing.price_amount) + ' ' + (listing.currency || 'EGP')
                      : 'N/A'
                  ]
                ),

                D.Text.Span(
                  { attrs: { class: tw('text-sm px-3 py-1 rounded-full', themed(db, 'bg-slate-700 text-slate-300', 'bg-slate-100 text-slate-700')) } },
                  [listing.listing_type === 'sale' ? (db.lang === 'ar' ? 'للبيع' : 'For Sale') : (db.lang === 'ar' ? 'للإيجار' : 'For Rent')]
                )
              ]
            )
          ]
        )
      ]
    );
  }

  function ListingsGrid(db) {
    var listings = db.listings || [];

    if (listings.length === 0) {
      return D.Containers.Div(
        { attrs: { class: 'text-center py-20' } },
        [
          D.Text.P(
            { attrs: { class: tw('text-xl', themed(db, 'text-slate-400', 'text-slate-600')) } },
            [db.lang === 'ar' ? 'لا توجد وحدات متاحة' : 'No listings available']
          )
        ]
      );
    }

    return D.Containers.Div(
      { attrs: { class: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6' } },
      listings.map(function (listing) {
        return ListingCard(db, listing);
      })
    );
  }

  function LoadingSpinner(db) {
    return D.Containers.Div(
      { attrs: { class: 'flex items-center justify-center py-20' } },
      [
        D.Containers.Div(
          { attrs: { class: 'animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-500' } },
          []
        )
      ]
    );
  }

  // ===========================
  // Main Body Function
  // ===========================
  M.app.setBody(function (db, DSL) {
    // Update D reference
    D = DSL;

    return D.Containers.Div(
      { attrs: { class: tw('min-h-screen', themed(db, 'bg-slate-900 text-white', 'bg-slate-50 text-slate-900')) } },
      [
        Header(db),

        D.Containers.Main(
          { attrs: { class: 'container mx-auto' } },
          [
            db.loading ? LoadingSpinner(db) : ListingsGrid(db)
          ]
        ),

        // Footer
        D.Containers.Footer(
          { attrs: { class: tw('border-t py-8 mt-20 text-center', themed(db, 'border-slate-800 text-slate-400', 'border-slate-200 text-slate-600')) } },
          [
            D.Text.P({}, [db.lang === 'ar' ? 'بُني بواسطة Mishkah.js ❤️' : 'Built with Mishkah.js ❤️'])
          ]
        )
      ]
    );
  });

  // ===========================
  // Orders (Event Handlers)
  // ===========================
  var orders = {
    'toggle-lang': {
      on: ['click'],
      gkeys: ['toggle-lang'],
      handler: function (event, ctx) {
        var state = ctx.getState();
        var newLang = state.lang === 'ar' ? 'en' : 'ar';
        var newDir = newLang === 'ar' ? 'rtl' : 'ltr';

        var newState = {
          lang: newLang,
          dir: newDir
        };

        // Save preferences
        savePrefs({ lang: newLang, dir: newDir, theme: state.theme });

        // Update state (will trigger WebSocket reconnect with new lang)
        ctx.setState(function (prev) {
          var updated = Object.assign({}, prev, newState);
          syncDocumentEnv(updated);
          return updated;
        });
      }
    },

    'toggle-theme': {
      on: ['click'],
      gkeys: ['toggle-theme'],
      handler: function (event, ctx) {
        var state = ctx.getState();
        var newTheme = state.theme === 'dark' ? 'light' : 'dark';

        // Save preferences
        savePrefs({ lang: state.lang, dir: state.dir, theme: newTheme });

        ctx.setState(function (prev) {
          var updated = Object.assign({}, prev, { theme: newTheme });
          syncDocumentEnv(updated);
          return updated;
        });
      }
    },

    'listing-click': {
      on: ['click'],
      keys: ['listing-*'],
      handler: function (event, ctx) {
        var key = event.target.closest('[data-m-key]')?.dataset?.mKey;
        if (!key) return;

        var listingId = key.replace('listing-', '');
        ctx.setState(function (prev) {
          return Object.assign({}, prev, {
            view: 'listing-detail',
            selectedListingId: listingId
          });
        });
      }
    }
  };

  // ===========================
  // Create Mishkah App
  // ===========================
  // Get DB instance from window (initialized by scaffold in HTML)
  var db = global.__BROCKER_DB__;

  if (!db) {
    console.error('[Brocker v2] Database not initialized. Make sure index-v2.html initialized it first.');
    return;
  }

  console.log('[Brocker v2] Creating Mishkah app...');

  // Create the app
  var app = M.app.createApp(initialDatabase, orders);
  global.__BROCKER_APP__ = app;

  // Setup watchers to update app state when data changes
  var tables = ['listings', 'regions', 'brokers', 'units', 'unit_types'];

  tables.forEach(function (tableName) {
    db.watch(tableName, function (rows, meta) {
      console.log('[Brocker v2] Table "' + tableName + '" updated:', rows.length, 'rows');

      var update = { loading: false, connected: true };
      update[tableName] = rows;

      app.setState(function (prev) {
        return Object.assign({}, prev, update);
      });
    });
  });

  // Mount the app
  app.mount('#app');
  console.log('[Brocker v2] App mounted successfully!');

  // Listen to connection status
  if (typeof db.onConnect === 'function') {
    db.onConnect(function () {
      console.log('[Brocker v2] Connected to server');
      app.setState(function (prev) {
        return Object.assign({}, prev, { connected: true });
      });
    });
  }

  if (typeof db.onDisconnect === 'function') {
    db.onDisconnect(function () {
      console.log('[Brocker v2] Disconnected from server');
      app.setState(function (prev) {
        return Object.assign({}, prev, { connected: false });
      });
    });
  }
})();
