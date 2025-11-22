(function () {
  'use strict';

  var G = window;
  
  function startApp(M) {
    var D = M.DSL;
    var T = M.utils.twcss.tw; // الآن آمنة للاستخدام

    var P = new URLSearchParams(G.location.search);
    var BRANCH = P.get('branch') || P.get('branchId') || 'aqar';
    var MODULE = P.get('module') || P.get('moduleId') || 'brocker';
    var STORE_KEY = 'brocker_prefs_v3';

    var prefs = (function() {
      try { return JSON.parse(G.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
    })();

    var initialEnv = {
      theme: prefs.theme || 'dark',
      lang: prefs.lang || 'ar',
      dir: prefs.dir || (prefs.lang === 'en' ? 'ltr' : 'rtl'),
      i18n: {}
    };

    if (G.document) {
      var root = G.document.documentElement;
      root.setAttribute('lang', initialEnv.lang);
      root.setAttribute('dir', initialEnv.dir);
      root.setAttribute('data-theme', initialEnv.theme);
    }

    var dbInit = {
      env: initialEnv,
      meta: { branch: BRANCH, module: MODULE },
      state: {
        loading: true,
        view: 'home',
        filters: {},
        auth: { isAuthenticated: false, user: null, modal: false, mode: 'login' },
        modals: { broker: false, listing: false, subscribe: false },
        toast: null,
        pwa: { installed: false, gate: false }
      },
      data: {
        appSettings: {}, heroSlides: [], regions: [], unitTypes: [],
        listings: [], brokers: [], units: [], unitMedia: [],
        inquiries: [], notifications: [], uiLabels: [],
        app_settings_lang: [], regions_lang: [], unit_types_lang: [],
        listings_lang: [], units_lang: []
      }
    };

    var socket = null;

    function t(key, def, db) {
      var env = (db && db.env) || initialEnv;
      var map = env.i18n || {};
      var row = map[key];
      var lang = env.lang || 'ar';
      if (row && row[lang]) return row[lang];
      if (row && row.en) return row.en;
      return def || key;
    }

    function l(table, id, field, val, db) {
      var lang = db.env.lang;
      if (lang === 'ar') return val;
      var langTable = db.data[table + '_lang'] || [];
      var fk = table + '_id';
      // تصحيح البحث عن الترجمة في الجدول المنفصل
      for (var i = 0; i < langTable.length; i++) {
        var row = langTable[i];
        // دعم أسماء الحقول المختلفة للربط (مثل listings_id أو listing_id)
        var rowRef = row[fk] || row[table + 's_id'] || row[table + 'Id'];
        if (rowRef === id && row.lang === lang && row[field]) {
          return row[field];
        }
      }
      return val;
    }

    function th(db, d, l) {
      return (db && db.env && db.env.theme === 'light') ? l : d;
    }

    function media(url) {
      if (!url) return '';
      if (/^https?:\/\//i.test(url)) return url;
      if (url.indexOf('//') === 0) return (G.location.protocol) + url;
      return url;
    }

    function price(listing, db) {
      if (!listing) return '';
      var val = Number(listing.price_amount || listing.price || 0);
      var cur = listing.currency || 'EGP';
      try {
        var loc = db.env.lang === 'ar' ? 'ar-EG' : 'en-US';
        var fmt = new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: 0 });
        return fmt.format(val) + (listing.price_period ? ' / ' + listing.price_period : '');
      } catch (e) { return val + ' ' + cur; }
    }

    function BrandLogo(db, cls) {
      var s = db.data.appSettings || {};
      var src = s.brand_logo;
      if (src && db.env.theme === 'dark') src = src.replace(/(\.[a-z0-9]+)$/i, '-light$1');
      return src ? D.Media.Img({ attrs: { src: src, class: cls || 'h-12 w-12 object-contain' } }) : null;
    }

    function HeaderSection(db) {
      var s = db.data.appSettings || {};
      // استخدام l() لترجمة الإعدادات القادمة من قاعدة البيانات
      var name = l('app_settings', s.id, 'brand_name', s.brand_name || 'Makateb Aqarat', db);
      var tag = l('app_settings', s.id, 'tagline', s.tagline, db);
      
      return D.Containers.Header({ attrs: { class: T('space-y-3 text-center', th(db, 'text-white', 'text-slate-900')) } }, [
        BrandLogo(db, 'mx-auto h-14 w-14 object-contain'),
        D.Text.H1({ attrs: { class: 'text-3xl font-semibold' } }, [name]),
        tag ? D.Text.P({ attrs: { class: T('text-base', th(db, 'text-slate-300', 'text-slate-600')) } }, [tag]) : null
      ]);
    }

    function PreferencesBar(db) {
      var s = db.data.appSettings || {};
      var lang = db.env.lang;
      var theme = db.env.theme;
      var name = l('app_settings', s.id, 'brand_name', s.brand_name || 'Makateb Aqarat', db);

      return D.Containers.Div({ attrs: { class: T('fixed top-0 left-0 right-0 z-40 border-b backdrop-blur-xl', th(db, 'bg-slate-950/90 border-white/5', 'bg-white/90 border-slate-200')) } }, [
        D.Containers.Div({ attrs: { class: 'mx-auto flex max-w-xl items-center justify-between px-4 py-3' } }, [
          D.Containers.Div({ attrs: { class: 'flex items-center gap-2' } }, [
            BrandLogo(db, 'h-8 w-8 object-contain'),
            D.Text.Span({ attrs: { class: T('text-sm font-bold', th(db, 'text-white', 'text-slate-900')) } }, [name])
          ]),
          D.Containers.Div({ attrs: { class: 'flex gap-2' } }, [
            D.Forms.Button({ attrs: { type: 'button', class: 'px-3 py-1 text-xs font-bold', 'data-m-gkey': 'theme-toggle' } }, [theme === 'dark' ? '☀️' : '🌙']),
            D.Forms.Button({ attrs: { type: 'button', class: 'px-3 py-1 text-xs font-bold border rounded', 'data-m-gkey': 'lang-toggle' } }, [lang === 'ar' ? 'EN' : 'AR']),
            !db.state.auth.isAuthenticated ? D.Forms.Button({ attrs: { type: 'button', class: 'px-3 py-1 text-xs font-bold bg-emerald-600 text-white rounded', 'data-m-gkey': 'show-auth-modal' } }, [t('auth.loginBtn', 'Login', db)]) : null
          ])
        ])
      ]);
    }

    function HeroSlideCard(slide, db) {
      return D.Containers.Article({ attrs: { class: 'relative overflow-hidden rounded-2xl aspect-video' } }, [
        D.Media.Img({ attrs: { src: media(slide.media_url), class: 'absolute inset-0 h-full w-full object-cover' } }),
        D.Containers.Div({ attrs: { class: 'absolute inset-0 bg-black/40 p-4 flex flex-col justify-end' } }, [
          D.Text.H3({ attrs: { class: 'text-white font-bold text-lg' } }, [l('hero_slides', slide.id, 'title', slide.title, db)]),
          slide.subtitle ? D.Text.P({ attrs: { class: 'text-white/90 text-sm' } }, [l('hero_slides', slide.id, 'subtitle', slide.subtitle, db)]) : null
        ])
      ]);
    }

    function ListingCard(db, model) {
      var lItem = model.listing;
      var u = model.unit || {};
      var m = model.coverMedia || {};
      return D.Containers.Article({
        attrs: { class: T('overflow-hidden rounded-3xl border cursor-pointer', th(db, 'border-white/5 bg-slate-950', 'border-slate-200 bg-white')), 'data-m-gkey': 'listing-card', 'data-listing-id': lItem.id }
      }, [
        D.Media.Img({ attrs: { src: media(m.url), class: 'h-48 w-full object-cover' } }),
        D.Containers.Div({ attrs: { class: 'p-4 space-y-2' } }, [
          D.Text.H3({ attrs: { class: T('font-bold', th(db, 'text-white', 'text-slate-900')) } }, [l('listings', lItem.id, 'headline', lItem.headline, db)]),
          D.Text.P({ attrs: { class: T('text-sm line-clamp-2', th(db, 'text-slate-400', 'text-slate-600')) } }, [l('listings', lItem.id, 'excerpt', lItem.excerpt, db)]),
          D.Containers.Div({ attrs: { class: 'flex justify-between items-center pt-2 border-t border-white/5' } }, [
            D.Text.Span({ attrs: { class: 'text-xs text-slate-500' } }, [u.area ? u.area + ' m²' : '']),
            D.Text.Strong({ attrs: { class: 'text-emerald-500' } }, [price(lItem, db)])
          ])
        ])
      ]);
    }

    function SearchPanel(db) {
      var regs = db.data.regions || [];
      var types = db.data.unitTypes || [];
      return D.Forms.Form({ attrs: { class: T('p-4 rounded-2xl bg-slate-900/50 border border-white/10 space-y-3') } }, [
        D.Text.H3({ attrs: { class: 'text-white font-semibold' } }, [t('search.title', 'Search', db)]),
        D.Containers.Div({ attrs: { class: 'grid grid-cols-2 gap-2' } }, [
          D.Inputs.Select({ attrs: { class: 'bg-slate-800 text-white p-2 rounded', 'data-m-gkey': 'filter', 'data-key': 'regionId' } }, 
            [D.Inputs.Option({ attrs: { value: '' } }, [t('search.allRegions', 'Regions', db)])].concat(regs.map(function(r){ return D.Inputs.Option({ attrs: { value: r.id } }, [l('regions', r.id, 'name', r.name, db)]); }))
          ),
          D.Inputs.Select({ attrs: { class: 'bg-slate-800 text-white p-2 rounded', 'data-m-gkey': 'filter', 'data-key': 'unitTypeId' } }, 
            [D.Inputs.Option({ attrs: { value: '' } }, [t('search.allUnitTypes', 'Types', db)])].concat(types.map(function(t){ return D.Inputs.Option({ attrs: { value: t.id } }, [l('unit_types', t.id, 'name', t.name, db)]); }))
          )
        ])
      ]);
    }

    function FooterSection(db) {
      var s = db.data.appSettings || {};
      var name = l('app_settings', s.id, 'brand_name', s.brand_name || 'Makateb Aqarat', db);
      var sub = l('app_settings', s.id, 'hero_subtitle', s.hero_subtitle, db);

      return D.Containers.Footer({ attrs: { class: 'mt-8 p-6 rounded-3xl bg-slate-900 text-white text-center space-y-4' } }, [
        BrandLogo(db, 'h-10 mx-auto'),
        D.Text.H3({ attrs: { class: 'font-bold' } }, [name]),
        D.Text.P({ attrs: { class: 'text-sm text-slate-400' } }, [sub]),
        D.Containers.Div({ attrs: { class: 'pt-4 border-t border-white/10 text-xs text-slate-500' } }, [
          t('footer.rights', 'All Rights Reserved', db)
        ])
      ]);
    }

    function HomeView(db) {
      var slides = db.data.heroSlides || [];
      var list = db.data.listings.map(function(li) {
        return { listing: li, unit: db.data.units.find(function(u){return u.id===li.unit_id}), coverMedia: db.data.unitMedia.find(function(m){return m.id===li.primary_media_id}) };
      });
      return D.Containers.Section({ attrs: { class: 'px-4 py-6 space-y-6 max-w-xl mx-auto' } }, [
        slides.length ? HeroSlideCard(slides[0], db) : null,
        SearchPanel(db),
        D.Containers.Div({ attrs: { class: 'space-y-4' } }, list.map(function(m){ return ListingCard(db, m); })),
        FooterSection(db)
      ]);
    }

    function AppView(db) {
      if (db.state.loading) return D.Containers.Div({ attrs: { class: 'flex h-screen items-center justify-center' } }, [t('misc.loading', 'Loading...', db)]);
      return D.Containers.Main({ attrs: { class: T('min-h-screen pb-20 pt-14', th(db, 'bg-slate-950 text-slate-100', 'bg-slate-50 text-slate-900')) } }, [
        PreferencesBar(db),
        HomeView(db)
      ]);
    }

    var orders = {
      'ui.env.lang': {
        on: ['click'], gkeys: ['lang-toggle'],
        handler: function (e, ctx) {
          var next = ctx.getState().env.lang === 'ar' ? 'en' : 'ar';
          var dir = next === 'ar' ? 'rtl' : 'ltr';
          G.localStorage.setItem(STORE_KEY, JSON.stringify({ lang: next, dir: dir, theme: ctx.getState().env.theme }));
          G.location.reload();
        }
      },
      'ui.env.theme': {
        on: ['click'], gkeys: ['theme-toggle'],
        handler: function (e, ctx) {
          var next = ctx.getState().env.theme === 'dark' ? 'light' : 'dark';
          ctx.setState(function(db){ return Object.assign({}, db, { env: Object.assign({}, db.env, { theme: next }) }); });
        }
      },
      'auth.open': {
        on: ['click'], gkeys: ['show-auth-modal'],
        handler: function(e, ctx) {
          // Logic for auth modal would go here
        }
      }
    };

    function bootstrap(app) {
      var s = app.getState();
      var lang = s.env.lang;
      var base = G.MishkahAuto && G.MishkahAuto.config ? G.MishkahAuto.config.baseUrl : '';
      
      // نطلب البيانات مع لغة احتياطية لضمان وجود data
      var url = base + '/api/branches/' + BRANCH + '/modules/' + MODULE + '?lang=' + lang + '&fallback=ar';

      fetch(url).then(function(r){ return r.json(); }).then(function(snap) {
        var tbl = snap.tables || {};
        var lbl = tbl.ui_labels || [];
        var i18n = {};
        // بناء قاموس الترجمة للواجهة
        lbl.forEach(function(l){ if(!i18n[l.key]) i18n[l.key]={}; i18n[l.key][l.lang] = l.text; });
        
        app.setState(function(db){
          return Object.assign({}, db, {
            env: Object.assign({}, db.env, { i18n: i18n }),
            data: Object.assign({}, db.data, {
              appSettings: (tbl.app_settings||[])[0],
              app_settings_lang: tbl.app_settings_lang || [], // مهم جداً للترجمة
              heroSlides: tbl.hero_slides||[], regions: tbl.regions||[], unitTypes: tbl.unit_types||[],
              listings: tbl.listings||[], brokers: tbl.brokers||[], units: tbl.units||[],
              unitMedia: tbl.unit_media||[], inquiries: tbl.inquiries||[],
              regions_lang: tbl.regions_lang || [],
              unit_types_lang: tbl.unit_types_lang || [],
              listings_lang: tbl.listings_lang || []
            }),
            state: Object.assign({}, db.state, { loading: false })
          });
        });

        if (G.createDBAuto) {
          socket = G.createDBAuto(null, Object.keys(dbInit.data), { branchId: BRANCH, moduleId: MODULE, autoReconnect: true });
          socket.connect();
          Object.keys(dbInit.data).forEach(function(k){
            socket.watch(k, function(rows){
              app.setState(function(s){
                var d = Object.assign({}, s.data);
                d[k] = (k==='appSettings') ? (rows[0]||{}) : rows;
                return Object.assign({}, s, { data: d });
              });
            });
          });
        }
      });
    }

    if (M.app && M.app.createApp) {
      var app = M.app.createApp(dbInit, orders);
      M.app.setBody(AppView);
      app.mount('#app');
      appInstance = app;
      bootstrap(app);
    }
  }

  // The Safe Loader Implementation
  if (G.MishkahAuto && G.MishkahAuto.ready) {
    G.MishkahAuto.ready(function(M) { startApp(M); });
  } else if (G.Mishkah && G.Mishkah.DSL && G.Mishkah.utils && G.Mishkah.utils.twcss) {
    startApp(G.Mishkah);
  } else {
    G.addEventListener('load', function() {
      if (G.Mishkah) startApp(G.Mishkah);
    });
  }
})();
