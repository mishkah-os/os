(function () {
  'use strict';

  var G = window;
  var M = G.Mishkah;
  var D = M.DSL;
  var T = M.utils.twcss.tw;

  var P = new URLSearchParams(G.location.search);
  var BRANCH = P.get('branch') || P.get('branchId') || 'aqar';
  var MODULE = P.get('module') || P.get('moduleId') || 'brocker';
  var STORE_KEY = 'brocker_prefs_v3';

  var prefs = (function() {
    try { return JSON.parse(G.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  })();

  var env = {
    theme: prefs.theme || 'dark',
    lang: prefs.lang || 'ar',
    dir: prefs.dir || (prefs.lang === 'en' ? 'ltr' : 'rtl'),
    i18n: {}
  };

  if (G.document) {
    var root = G.document.documentElement;
    root.setAttribute('lang', env.lang);
    root.setAttribute('dir', env.dir);
    root.setAttribute('data-theme', env.theme);
  }

  var dbInit = {
    env: env,
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
      inquiries: [], notifications: [], uiLabels: []
    }
  };

  var socket = null;

  function t(k, db) {
    var map = db.env.i18n || {};
    var l = db.env.lang;
    return (map[k] && map[k][l]) ? map[k][l] : k;
  }

  function th(db, d, l) {
    return db.env.theme === 'light' ? l : d;
  }

  function money(val, cur, db) {
    try {
      return new Intl.NumberFormat(db.env.lang === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency: cur || 'EGP', maximumFractionDigits: 0 }).format(val);
    } catch (e) { return val + ' ' + cur; }
  }

  function date(val, db) {
    try {
      return new Intl.DateTimeFormat(db.env.lang === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium' }).format(new Date(val));
    } catch (e) { return val; }
  }

  function media(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return url.indexOf('//') === 0 ? G.location.protocol + url : url;
  }

  function Logo(db, cls) {
    var s = db.data.appSettings || {};
    var src = s.brand_logo;
    if (src && db.env.theme === 'dark') src = src.replace(/(\.[a-z0-9]+)$/i, '-light$1');
    return src ? D.Media.Img({ attrs: { src: src, class: cls } }) : null;
  }

  function Navbar(db) {
    var s = db.data.appSettings || {};
    var u = db.state.auth.user;
    return D.Containers.Nav({ attrs: { class: T('fixed top-0 z-50 w-full border-b backdrop-blur-xl', th(db, 'border-white/5 bg-slate-950/80', 'border-slate-200 bg-white/90')) } }, [
      D.Containers.Div({ attrs: { class: 'mx-auto flex h-16 max-w-7xl items-center justify-between px-4' } }, [
        D.Containers.Div({ attrs: { class: 'flex items-center gap-3 cursor-pointer', 'data-exec': 'nav.home' } }, [
          Logo(db, 'h-8 w-8 object-contain'),
          D.Text.Span({ attrs: { class: T('font-bold', th(db, 'text-white', 'text-slate-900')) } }, [s.brand_name])
        ]),
        D.Containers.Div({ attrs: { class: 'flex gap-2' } }, [
          D.Forms.Button({ attrs: { class: 'p-2', 'data-exec': 'sys.theme' } }, [db.env.theme === 'dark' ? '☀️' : '🌙']),
          D.Forms.Button({ attrs: { class: 'p-2 text-xs font-bold border rounded', 'data-exec': 'sys.lang' } }, [db.env.lang === 'ar' ? 'EN' : 'AR']),
          u ? D.Containers.Div({ attrs: { class: 'relative cursor-pointer', 'data-exec': 'ui.menu' } }, [D.Text.Span({ attrs: { class: 'font-medium' } }, [u.full_name])])
            : D.Forms.Button({ attrs: { class: 'bg-emerald-600 px-4 py-2 rounded text-white font-bold', 'data-exec': 'auth.open' } }, [t('auth.loginBtn', db)])
        ])
      ]),
      db.state.showMenu ? Menu(db) : null
    ]);
  }

  function Menu(db) {
    return D.Containers.Div({ attrs: { class: T('absolute top-16 right-4 w-48 rounded-xl border shadow-xl', th(db, 'bg-slate-900 border-slate-700', 'bg-white border-slate-200')) } }, [
      D.Forms.Button({ attrs: { class: 'block w-full px-4 py-3 text-start hover:bg-slate-800', 'data-exec': 'nav.dash' } }, [t('actions.dashboard', db)]),
      D.Forms.Button({ attrs: { class: 'block w-full px-4 py-3 text-start text-red-400 hover:bg-slate-800', 'data-exec': 'auth.out' } }, [t('actions.logout', db)])
    ]);
  }

  function Hero(db) {
    var s = db.data.appSettings || {};
    var slides = db.data.heroSlides || [];
    if (!slides.length) return null;
    var slide = slides[0];
    return D.Containers.Div({ attrs: { class: 'relative aspect-[21/9] w-full overflow-hidden rounded-3xl' } }, [
      D.Media.Img({ attrs: { src: media(slide.media_url), class: 'absolute inset-0 h-full w-full object-cover' } }),
      D.Containers.Div({ attrs: { class: 'absolute inset-0 bg-black/50 p-8 flex flex-col justify-end' } }, [
        D.Text.H2({ attrs: { class: 'text-3xl font-bold text-white' } }, [slide.title]),
        D.Text.P({ attrs: { class: 'text-slate-200' } }, [slide.subtitle])
      ])
    ]);
  }

  function Search(db) {
    var regs = db.data.regions || [];
    var types = db.data.unitTypes || [];
    return D.Forms.Form({ attrs: { class: T('grid gap-4 rounded-2xl border p-4 md:grid-cols-4', th(db, 'border-white/10 bg-slate-900/50', 'border-slate-200 bg-white')) } }, [
      D.Inputs.Select({ attrs: { class: 'rounded bg-slate-800 p-3 text-white', 'data-bind': 'filter.region' } }, 
        [D.Inputs.Option({ attrs: { value: '' } }, [t('search.allRegions', db)])].concat(regs.map(function(r) { return D.Inputs.Option({ attrs: { value: r.id } }, [r.name]); }))
      ),
      D.Inputs.Select({ attrs: { class: 'rounded bg-slate-800 p-3 text-white', 'data-bind': 'filter.type' } }, 
        [D.Inputs.Option({ attrs: { value: '' } }, [t('search.allUnitTypes', db)])].concat(types.map(function(t) { return D.Inputs.Option({ attrs: { value: t.id } }, [t.name]); }))
      ),
      D.Inputs.Select({ attrs: { class: 'rounded bg-slate-800 p-3 text-white', 'data-bind': 'filter.mode' } }, [
        D.Inputs.Option({ attrs: { value: '' } }, [t('search.allListings', db)]),
        D.Inputs.Option({ attrs: { value: 'sale' } }, [t('listing.type.sale', db)]),
        D.Inputs.Option({ attrs: { value: 'rent' } }, [t('listing.type.rent', db)])
      ]),
      D.Forms.Button({ attrs: { class: 'rounded bg-emerald-600 font-bold text-white' } }, [t('search.title', db)])
    ]);
  }

  function Card(db, item) {
    var u = db.data.units.find(function(x) { return x.id === item.unit_id; }) || {};
    var m = db.data.unitMedia.find(function(x) { return x.id === item.primary_media_id; }) || {};
    return D.Containers.Article({ attrs: { class: 'overflow-hidden rounded-3xl border cursor-pointer', 'data-exec': 'nav.item', 'data-id': item.id } }, [
      D.Media.Img({ attrs: { src: media(m.url), class: 'h-48 w-full object-cover' } }),
      D.Containers.Div({ attrs: { class: 'p-4 space-y-2' } }, [
        D.Text.H3({ attrs: { class: 'font-bold' } }, [item.headline]),
        D.Text.P({ attrs: { class: 'text-sm opacity-70 line-clamp-2' } }, [item.excerpt]),
        D.Containers.Div({ attrs: { class: 'flex justify-between pt-2 border-t border-white/10' } }, [
          D.Text.Span({}, [u.area ? u.area + ' m²' : '']),
          D.Text.Strong({ attrs: { class: 'text-emerald-500' } }, [money(item.price_amount, item.currency, db)])
        ])
      ])
    ]);
  }

  function Grid(db) {
    var list = db.data.listings || [];
    var f = db.state.filters;
    if (f.region) list = list.filter(function(x) { return x.region_id === f.region; });
    if (f.type) list = list.filter(function(x) { var u = db.data.units.find(function(z) { return z.id === x.unit_id; }); return u && u.unit_type_id === f.type; });
    if (f.mode) list = list.filter(function(x) { return x.listing_type === f.mode; });
    
    if (!list.length) return D.Containers.Div({ attrs: { class: 'py-12 text-center opacity-50' } }, [t('listings.empty', db)]);
    return D.Containers.Div({ attrs: { class: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3' } }, list.map(function(x) { return Card(db, x); }));
  }

  function Footer(db) {
    var s = db.data.appSettings || {};
    return D.Containers.Footer({ attrs: { class: 'mt-20 border-t border-white/10 py-12 text-center' } }, [
      Logo(db, 'mx-auto mb-4 h-12 w-12 object-contain opacity-50 grayscale'),
      D.Text.H3({ attrs: { class: 'font-bold' } }, [s.brand_name]),
      D.Text.P({ attrs: { class: 'text-sm opacity-60' } }, [s.hero_subtitle]),
      D.Text.P({ attrs: { class: 'mt-4 text-xs opacity-40' } }, ['© 2025 ' + s.brand_name])
    ]);
  }

  function Auth(db) {
    if (!db.state.auth.modal) return null;
    var mode = db.state.auth.mode;
    return D.Containers.Div({ attrs: { class: 'fixed inset-0 z-50 grid place-items-center bg-black/80', 'data-exec': 'auth.close' } }, [
      D.Containers.Div({ attrs: { class: 'w-full max-w-md rounded-2xl bg-slate-900 p-8 border border-white/10', onclick: 'event.stopPropagation()' } }, [
        D.Text.H2({ attrs: { class: 'text-2xl font-bold mb-4' } }, [t(mode === 'login' ? 'auth.login' : 'auth.register', db)]),
        D.Forms.Form({ attrs: { 'data-exec': 'auth.sub' } }, [
          mode === 'register' ? D.Inputs.Input({ attrs: { name: 'name', class: 'w-full mb-3 rounded bg-slate-800 p-3', placeholder: t('auth.fullName', db) } }) : null,
          D.Inputs.Input({ attrs: { name: 'user', class: 'w-full mb-3 rounded bg-slate-800 p-3', placeholder: 'Email / Phone' } }),
          D.Inputs.Input({ attrs: { name: 'pass', type: 'password', class: 'w-full mb-4 rounded bg-slate-800 p-3', placeholder: 'Password' } }),
          D.Forms.Button({ attrs: { class: 'w-full rounded bg-emerald-600 p-3 font-bold' } }, [t(mode === 'login' ? 'auth.loginBtn' : 'auth.register', db)]),
          D.Forms.Button({ attrs: { type: 'button', class: 'w-full mt-2 text-sm opacity-60', 'data-exec': 'auth.switch' } }, [t(mode === 'login' ? 'auth.registerTab' : 'auth.loginTab', db)])
        ])
      ])
    ]);
  }

  function Home(db) {
    return D.Containers.Div({ attrs: { class: 'mx-auto max-w-7xl px-4 py-8 space-y-8' } }, [
      Hero(db), Search(db), Grid(db), Footer(db)
    ]);
  }

  function Detail(db) {
    var id = db.state.selectedId;
    var item = db.data.listings.find(function(x) { return x.id === id; });
    if (!item) return D.Containers.Div({}, ['404']);
    var u = db.data.units.find(function(x) { return x.id === item.unit_id; }) || {};
    var imgs = db.data.unitMedia.filter(function(x) { return x.unit_id === item.unit_id; });

    return D.Containers.Div({ attrs: { class: 'mx-auto max-w-4xl px-4 py-8' } }, [
      D.Forms.Button({ attrs: { class: 'mb-4', 'data-exec': 'nav.home' } }, ['← ' + t('listing.back', db)]),
      D.Containers.Div({ attrs: { class: 'grid gap-4 md:grid-cols-2' } }, imgs.map(function(m) { return D.Media.Img({ attrs: { src: media(m.url), class: 'rounded-xl' } }); })),
      D.Text.H1({ attrs: { class: 'text-3xl font-bold mt-6' } }, [item.headline]),
      D.Text.H2({ attrs: { class: 'text-2xl text-emerald-500' } }, [money(item.price_amount, item.currency, db)]),
      D.Text.P({ attrs: { class: 'mt-4 opacity-80' } }, [item.excerpt]),
      D.Containers.Div({ attrs: { class: 'grid grid-cols-3 gap-4 border-y border-white/10 py-6 my-6 text-center' } }, [
        D.Text.Strong({}, [u.bedrooms + ' ' + t('listing.bedrooms', db)]),
        D.Text.Strong({}, [u.bathrooms + ' ' + t('listing.bathrooms', db)]),
        D.Text.Strong({}, [u.area + ' m²'])
      ]),
      D.Forms.Form({ attrs: { class: 'bg-slate-900 p-6 rounded-2xl space-y-4', 'data-exec': 'form.lead' } }, [
        D.Text.H3({ attrs: { class: 'font-bold' } }, [t('listing.contact', db)]),
        D.Inputs.Input({ attrs: { name: 'phone', class: 'w-full rounded bg-slate-800 p-3', placeholder: t('forms.contactPhone', db) } }),
        D.Inputs.Textarea({ attrs: { name: 'msg', class: 'w-full rounded bg-slate-800 p-3', rows: 3 } }),
        D.Forms.Button({ attrs: { class: 'w-full rounded bg-emerald-600 p-3 font-bold' } }, [t('forms.submit', db)])
      ])
    ]);
  }

  function View(db) {
    if (db.state.loading) return D.Containers.Div({ attrs: { class: 'grid h-screen place-items-center' } }, [t('misc.loading', db)]);
    var v = db.state.view;
    var content = v === 'detail' ? Detail(db) : Home(db);
    return D.Containers.Main({ attrs: { class: T('min-h-screen pt-16 transition-colors', th(db, 'bg-black text-slate-100', 'bg-slate-50 text-slate-900')) } }, [
      Navbar(db), content, Auth(db),
      db.state.toast ? D.Containers.Div({ attrs: { class: 'fixed bottom-4 right-4 bg-emerald-600 px-6 py-3 rounded text-white' } }, [db.state.toast]) : null
    ]);
  }

  var ACTS = {
    'sys.theme': function(e, ctx) {
      var n = ctx.getState().env.theme === 'dark' ? 'light' : 'dark';
      G.localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({}, prefs, { theme: n })));
      ctx.setState(function(s){ return Object.assign({}, s, { env: Object.assign({}, s.env, { theme: n }) }); });
    },
    'sys.lang': function(e, ctx) {
      var n = ctx.getState().env.lang === 'ar' ? 'en' : 'ar';
      var d = n === 'ar' ? 'rtl' : 'ltr';
      G.localStorage.setItem(STORE_KEY, JSON.stringify({ lang: n, dir: d, theme: ctx.getState().env.theme }));
      G.location.reload();
    },
    'nav.home': function(e, ctx) { ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { view: 'home' }) }); }); },
    'nav.item': function(e, ctx) { 
      var id = e.currentTarget.getAttribute('data-id');
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { view: 'detail', selectedId: id }) }); }); 
    },
    'filter.region': function(e, ctx) { 
      var v = e.target.value;
      ctx.setState(function(s){ var f=Object.assign({}, s.state.filters); f.region=v; return Object.assign({}, s, { state: Object.assign({}, s.state, { filters: f }) }); });
    },
    'filter.type': function(e, ctx) {
      var v = e.target.value;
      ctx.setState(function(s){ var f=Object.assign({}, s.state.filters); f.type=v; return Object.assign({}, s, { state: Object.assign({}, s.state, { filters: f }) }); });
    },
    'filter.mode': function(e, ctx) {
      var v = e.target.value;
      ctx.setState(function(s){ var f=Object.assign({}, s.state.filters); f.mode=v; return Object.assign({}, s, { state: Object.assign({}, s.state, { filters: f }) }); });
    },
    'ui.menu': function(e, ctx) {
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { showMenu: !s.state.showMenu }) }); });
    },
    'auth.open': function(e, ctx) {
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { auth: Object.assign({}, s.state.auth, { modal: true }) }) }); });
    },
    'auth.close': function(e, ctx) {
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { auth: Object.assign({}, s.state.auth, { modal: false }) }) }); });
    },
    'auth.switch': function(e, ctx) {
      ctx.setState(function(s){ 
        var m = s.state.auth.mode === 'login' ? 'register' : 'login';
        return Object.assign({}, s, { state: Object.assign({}, s.state, { auth: Object.assign({}, s.state.auth, { mode: m }) }) }); 
      });
    },
    'auth.sub': function(e, ctx) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var u = { id: 'u1', full_name: fd.get('name') || 'User', email: fd.get('user') };
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { auth: { authenticated: true, user: u, modal: false } }) }); });
    },
    'auth.out': function(e, ctx) {
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { auth: { authenticated: false }, showMenu: false }) }); });
    },
    'form.lead': function(e, ctx) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var rec = { id: 'lead-'+Date.now(), phone: fd.get('phone'), msg: fd.get('msg'), created_at: new Date().toISOString() };
      if(socket) socket.insert('inquiries', rec);
      ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { toast: 'Sent!' }) }); });
      setTimeout(function(){ ctx.setState(function(s){ return Object.assign({}, s, { state: Object.assign({}, s.state, { toast: null }) }); }); }, 3000);
    }
  };

  var DEF = {};
  Object.keys(ACTS).forEach(function(k){ DEF[k] = { on: ['click','change','submit'], gkeys: [k], handler: ACTS[k] }; });

  function boot(app) {
    var url = '/api/branches/' + BRANCH + '/modules/' + MODULE + '?lang=' + env.lang;
    fetch(url).then(function(r){ return r.json(); }).then(function(res) {
      var t = res.tables || {};
      var labels = t.ui_labels || [];
      var i18n = {};
      labels.forEach(function(r){ if(!i18n[r.key]) i18n[r.key]={}; i18n[r.key][r.lang] = r.text; });
      
      app.setState(function(s){
        var next = Object.assign({}, s.data);
        Object.keys(t).forEach(function(k){ next[k] = (k==='app_settings') ? (t[k][0]||{}) : t[k]; });
        
        // Hydration Check for App Settings
        var settings = next.appSettings;
        if (settings && settings.lang !== env.lang && next.app_settings_lang) {
           var tr = next.app_settings_lang.find(function(x){ return x.app_settings_id === settings.id && x.lang === env.lang; });
           if (tr) Object.assign(settings, tr);
        }

        return Object.assign({}, s, {
          env: Object.assign({}, s.env, { i18n: i18n }),
          data: next,
          state: Object.assign({}, s.state, { loading: false })
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
    var app = M.app.createApp(dbInit, DEF);
    M.app.setBody(View);
    app.mount('#app');
    boot(app);
  }
})();
