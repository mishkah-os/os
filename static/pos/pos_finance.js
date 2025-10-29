import './pos-fin-comp.js';
import { ensureArray, localizeText } from './pos-mini-utils.js';

(function (global) {
  const M = global.Mishkah;
  if (!M || !M.utils || !M.DSL) {
    console.warn('[POS Finance] Mishkah runtime is unavailable.');
    return;
  }

  const db = global.__POS_DB__;
  if (!db) {
    console.warn('[POS Finance] POS database is not ready.');
  }

  const initialPayload = typeof global.database === 'object' && global.database ? global.database : {};

  const DEFAULT_PURGE_TABLES = ['order_header', 'order_line', 'order_payment', 'pos_shift'];

  const defaultLang = (initialPayload.settings && initialPayload.settings.lang) || 'ar';

  const PREF_KEY = '__POS_FINANCE_PREFS__';
  const supportedLangs = new Set(['ar', 'en']);

  const readPreferences = () => {
    if (!global.localStorage) return {};
    try {
      const raw = global.localStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_err) {
      return {};
    }
  };

  const writePreferences = (prefs) => {
    if (!global.localStorage) return;
    try {
      global.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (_err) {
      /* ignore */
    }
  };

  const storedPrefs = readPreferences();
  let activeLang = supportedLangs.has(storedPrefs.lang) ? storedPrefs.lang : defaultLang;
  if (!supportedLangs.has(activeLang)) {
    activeLang = 'ar';
  }
  let activeTheme = storedPrefs.theme === 'light' ? 'light' : 'dark';

  const persistPreferences = () => {
    writePreferences({ theme: activeTheme, lang: activeLang });
  };

  const applyDocumentLang = (lang) => {
    const root = global.document?.documentElement;
    if (!root) return;
    root.lang = lang;
    root.dir = lang === 'en' ? 'ltr' : 'rtl';
  };

  const applyDocumentTheme = (theme) => {
    const root = global.document?.documentElement;
    if (!root) return;
    const resolved = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
  };

  applyDocumentLang(activeLang);
  applyDocumentTheme(activeTheme);

  const translateHeadTitle = (lang) => (lang === 'en' ? 'Mishkah POS — Finance Closing' : 'لوحة الإغلاق المالي — Mishkah POS');

  const normalizeMap = (entries = [], lang = activeLang) => {
    const map = new Map();
    for (const entry of ensureArray(entries)) {
      if (!entry) continue;
      const id = entry.id || entry.code || entry.value || entry.key;
      if (!id) continue;
      const label =
        localizeText(
          entry.name || entry.status_name || entry.payment_name || entry.type_name || entry.label,
          lang
        ) || entry.label || entry.name || '';
      map.set(String(id), label);
    }
    return map;
  };

  const translatePaymentMethods = (methods = [], lang = activeLang) =>
    ensureArray(methods).map((method) => {
      if (!method) return method;
      const label = localizeText(method.name, lang) || method.label || method.name || '';
      return { ...method, label };
    });

  let latestPayload = { ...initialPayload };

  const localizeFromPayload = (payload = latestPayload, lang = activeLang) => {
    const source = payload && Object.keys(payload).length ? payload : initialPayload;
    const paymentMethodsSource = source.payment_methods || source.paymentMethods || [];
    const statusesSource = source.order_statuses || source.orderStatuses || [];
    const paymentStatesSource = source.order_payment_states || source.orderPaymentStates || [];
    const orderTypesSource = source.order_types || source.orderTypes || [];
    return {
      paymentMethods: translatePaymentMethods(paymentMethodsSource, lang),
      lookups: {
        statuses: normalizeMap(statusesSource, lang),
        payments: normalizeMap(paymentStatesSource, lang),
        types: normalizeMap(orderTypesSource, lang)
      }
    };
  };

  const localizedInitial = localizeFromPayload(latestPayload, activeLang);
  let currentPaymentMethods = localizedInitial.paymentMethods;
  let lookups = localizedInitial.lookups;

  const initialOrders = db ? ensureArray(db.list('order_header')) : [];
  const initialPayments = db ? ensureArray(db.list('order_payment')) : [];
  const initialLines = db ? ensureArray(db.list('order_line')) : [];
  const initialShifts = db ? ensureArray(db.list('pos_shift')) : [];

  const settings = initialPayload.settings || {};
  const branchSync = settings.sync || {};
  const branch = {
    id: branchSync.branch_id || branchSync.branchId || branchSync.id || settings.branch_id || settings.branchId || 'branch-main',
    nameAr:
      (branchSync.branch_name && branchSync.branch_name.ar) ||
      (branchSync.branchName && branchSync.branchName.ar) ||
      settings.branch_name?.ar ||
      settings.branchName?.ar ||
      'الفرع الرئيسي',
    nameEn:
      (branchSync.branch_name && branchSync.branch_name.en) ||
      (branchSync.branchName && branchSync.branchName.en) ||
      settings.branch_name?.en ||
      settings.branchName?.en ||
      'Main Branch'
  };

  const currency = settings.currency || { code: 'EGP', symbols: { ar: 'ج.م', en: 'E£' } };

  const ensureNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const translateResetMessage = (type, context = {}) => {
    const lang = context.lang || activeLang;
    switch (type) {
      case 'cancelled':
        return lang === 'en'
          ? 'Order reset cancelled (invalid code).'
          : 'تم إلغاء إعادة ضبط الطلبات (رمز غير صحيح).';
      case 'pending':
        return lang === 'en'
          ? 'Resetting transaction data...'
          : 'جاري إعادة ضبط بيانات الحركات...';
      case 'success': {
        const removed = Number(context.removed ?? 0);
        const base =
          lang === 'en'
            ? `Transactions reset successfully (${removed} records)`
            : `تمت إعادة ضبط بيانات الحركات بنجاح (${removed} سجل)`;
        const tablesSummary = context.tablesSummary ? String(context.tablesSummary).trim() : '';
        if (tablesSummary) {
          const detailsLabel = lang === 'en' ? 'Details:' : 'التفاصيل:';
          return `${base}. ${detailsLabel} ${tablesSummary}.`;
        }
        return `${base}.`;
      }
      case 'failure': {
        const base =
          lang === 'en'
            ? 'Failed to reset order data.'
            : 'تعذر إعادة ضبط بيانات الطلبات.';
        const details = context.details ? String(context.details).trim() : '';
        return details ? `${base} ${details}` : base;
      }
      case 'network':
        return lang === 'en'
          ? 'Unable to reach the reset service.'
          : 'تعذر الاتصال بخادم إعادة الضبط.';
      default:
        return '';
    }
  };

  const translateCloseMessage = (type, context = {}) => {
    const lang = context.lang || activeLang;
    switch (type) {
      case 'pending':
        return lang === 'en'
          ? 'Sending closing payload...'
          : 'جاري إرسال بيانات الإغلاق...';
      case 'success':
        return lang === 'en'
          ? 'Closing submitted successfully (demo).'
          : 'تم إرسال الإغلاق بنجاح (تجريبي).';
      case 'failure':
        return lang === 'en'
          ? 'Demo closing submission failed.'
          : 'فشل إرسال الإغلاق التجريبي.';
      case 'network':
        return lang === 'en'
          ? 'Could not reach the demo closing endpoint.'
          : 'تعذر الوصول إلى نقطة الإغلاق التجريبية.';
      default:
        return '';
    }
  };

  const computePaymentsFromOrders = (orders = []) => {
    const totals = new Map();
    for (const order of ensureArray(orders)) {
      const methodId = order.defaultPaymentMethodId || order.paymentMethodId || order.payment_method_id || null;
      if (!methodId) continue;
      const paid = ensureNumber(order.totalPaid ?? order.total_paid ?? 0);
      if (!paid) continue;
      totals.set(String(methodId), ensureNumber(totals.get(String(methodId)) || 0) + paid);
    }
    return totals;
  };

  const computePaymentBreakdown = (payments = [], orders = [], methods = []) => {
    const totals = new Map();
    for (const payment of ensureArray(payments)) {
      const methodId = payment.paymentMethodId || payment.methodId || payment.method || payment.payment_method_id;
      const amount = ensureNumber(payment.amount ?? payment.total ?? payment.value ?? payment.paidAmount);
      if (!methodId || !amount) continue;
      const key = String(methodId);
      totals.set(key, ensureNumber(totals.get(key) || 0) + amount);
    }
    if (!totals.size) {
      const fallback = computePaymentsFromOrders(orders);
      for (const [key, value] of fallback.entries()) {
        totals.set(key, ensureNumber(totals.get(key) || 0) + value);
      }
    }
    const list = Array.from(totals.entries()).map(([methodId, amount]) => {
      const info = methods.find((method) => String(method.id || method.code) === methodId) || {};
      return {
        methodId,
        amount,
        label: info.label || info.nameAr || info.name || methodId,
        icon: info.icon || '💳',
        type: info.type || 'other',
        typeLabel: info.type ? localizeText(info.type_name || info.typeLabel || info.type, activeLang) : ''
      };
    });
    list.sort((a, b) => ensureNumber(b.amount) - ensureNumber(a.amount));
    return list;
  };

  const computeFinancialSummary = ({ orders, payments, shifts }) => {
    const summary = {
      totals: {
        totalOrders: orders.length,
        subtotal: 0,
        totalDue: 0,
        totalPaid: 0,
        outstanding: 0,
        paidOrders: 0,
        openOrders: 0,
        closedOrders: 0,
        averageOrderValue: 0,
        totalPayments: 0
      },
      paymentBreakdown: [],
      openShifts: [],
      latestShift: null,
      updatedAt: Date.now(),
      currencyCode: currency.code || 'EGP'
    };

    for (const order of orders) {
      const subtotal = ensureNumber(order.subtotal ?? order.totalBeforeTax ?? order.total_before_tax);
      const due = ensureNumber(order.totalDue ?? order.total_due ?? order.total ?? order.total_amount);
      const paid = ensureNumber(order.totalPaid ?? order.total_paid ?? order.amount_paid);
      summary.totals.subtotal += subtotal;
      summary.totals.totalDue += due;
      summary.totals.totalPaid += paid;
      summary.totals.outstanding += Math.max(due - paid, 0);
      const statusId = order.statusId || order.status_id;
      if (statusId && ['closed', 'finalized'].includes(String(statusId))) {
        summary.totals.closedOrders += 1;
      }
      const paymentState = order.paymentStateId || order.payment_state_id;
      if (paymentState && ['paid', 'settled'].includes(String(paymentState))) {
        summary.totals.paidOrders += 1;
      }
      if (!paymentState || ['unpaid', 'open', 'pending'].includes(String(paymentState))) {
        summary.totals.openOrders += 1;
      }
    }

    summary.totals.averageOrderValue = summary.totals.totalOrders
      ? summary.totals.totalDue / summary.totals.totalOrders
      : 0;

    summary.paymentBreakdown = computePaymentBreakdown(payments, orders, currentPaymentMethods);
    summary.totals.totalPayments = summary.paymentBreakdown.reduce(
      (sum, entry) => sum + ensureNumber(entry.amount),
      0
    );

    const openShifts = [];
    let latestShift = null;
    let latestClosedTime = 0;
    for (const shift of shifts) {
      const isClosed = shift.isClosed || shift.status === 'closed';
      if (!isClosed) {
        openShifts.push(shift);
      }
      const closedAt = shift.closedAt || shift.closed_at;
      if (closedAt) {
        const ts = Date.parse(closedAt);
        if (!Number.isNaN(ts) && ts > latestClosedTime) {
          latestClosedTime = ts;
          latestShift = shift;
        }
      }
    }

    summary.openShifts = openShifts;
    summary.latestShift = latestShift;
    return summary;
  };

  const buildState = ({ orders, payments, lines, shifts, summary, newLookups, lang = activeLang, theme = activeTheme }) => ({
    head: { title: translateHeadTitle(lang) },
    env: { theme, lang, dir: lang === 'en' ? 'ltr' : 'rtl' },
    data: {
      lang,
      branch,
      settings,
      currency,
      paymentMethods: currentPaymentMethods,
      lookups: newLookups || lookups,
      orders,
      orderLines: lines,
      payments,
      shifts,
      summary
    },
    ui: {
      resetStatus: 'idle',
      resetMessage: '',
      closingStatus: 'idle',
      closingMessage: '',
      lastResetAt: null,
      lastResetResponse: null,
      lastClosingResponse: null
    }
  });

  const summary = computeFinancialSummary({
    orders: initialOrders,
    payments: initialPayments,
    shifts: initialShifts
  });

  const initialState = buildState({
    orders: initialOrders,
    payments: initialPayments,
    lines: initialLines,
    shifts: initialShifts,
    summary,
    newLookups: lookups,
    lang: activeLang,
    theme: activeTheme
  });

  const app = M.app.createApp(initialState, {});
  M.utils.twcss.auto(initialState, app, { pageScaffold: true });

  const { FinanceAppView } = global.PosFinanceComponents || {};
  if (typeof FinanceAppView !== 'function') {
    console.warn('[POS Finance] FinanceAppView is not available.');
  } else {
    M.app.setBody(FinanceAppView);
  }

  const updateData = () => {
    const orders = db ? ensureArray(db.list('order_header')) : [];
    const payments = db ? ensureArray(db.list('order_payment')) : [];
    const lines = db ? ensureArray(db.list('order_line')) : [];
    const shifts = db ? ensureArray(db.list('pos_shift')) : [];
    const summary = computeFinancialSummary({ orders, payments, shifts });
    app.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        orders,
        orderLines: lines,
        payments,
        shifts,
        summary
      }
    }));
  };

  const updateLookupsFromPayload = (payload = {}) => {
    latestPayload = { ...latestPayload, ...payload };
    const localized = localizeFromPayload(latestPayload, activeLang);
    if (localized.paymentMethods?.length) {
      currentPaymentMethods = localized.paymentMethods;
    }
    lookups = localized.lookups;

    app.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        paymentMethods: currentPaymentMethods,
        lookups
      }
    }));
  };

  const watchers = [];
  if (db) {
    watchers.push(
      db.watch('order_header', () => {
        updateData();
      })
    );
    watchers.push(
      db.watch('order_payment', () => {
        updateData();
      })
    );
    watchers.push(
      db.watch('order_line', () => {
        updateData();
      })
    );
    watchers.push(
      db.watch('pos_shift', () => {
        updateData();
      })
    );
    watchers.push(
      db.watch('pos_database', (rows) => {
        if (!rows || !rows.length) return;
        const latest = rows[rows.length - 1];
        if (!latest || !latest.payload) return;
        updateLookupsFromPayload(latest.payload);
      })
    );
  }

  const setUiState = (patch) => {
    app.setState((state) => ({
      ...state,
      ui: { ...state.ui, ...patch }
    }));
  };

  const setThemePreference = (theme) => {
    const resolved = theme === 'light' ? 'light' : 'dark';
    if (resolved === activeTheme) return;
    activeTheme = resolved;
    applyDocumentTheme(activeTheme);
    persistPreferences();
    app.setState((state) => ({
      ...state,
      env: { ...(state.env || {}), theme: activeTheme }
    }));
  };

  const setLanguagePreference = (lang) => {
    const resolved = lang === 'en' ? 'en' : 'ar';
    if (resolved === activeLang) return;
    activeLang = resolved;
    applyDocumentLang(activeLang);
    persistPreferences();

    const stateSnapshot = app.getState ? app.getState() : app.state;
    const localized = localizeFromPayload(latestPayload, activeLang);
    if (localized.paymentMethods?.length) {
      currentPaymentMethods = localized.paymentMethods;
    }
    lookups = localized.lookups;

    const summaryNext = computeFinancialSummary({
      orders: ensureArray(stateSnapshot?.data?.orders || []),
      payments: ensureArray(stateSnapshot?.data?.payments || []),
      shifts: ensureArray(stateSnapshot?.data?.shifts || [])
    });

    app.setState((state) => ({
      ...state,
      head: { title: translateHeadTitle(activeLang) },
      env: {
        ...(state.env || {}),
        theme: activeTheme,
        lang: activeLang,
        dir: activeLang === 'en' ? 'ltr' : 'rtl'
      },
      data: {
        ...state.data,
        lang: activeLang,
        paymentMethods: currentPaymentMethods,
        lookups,
        summary: summaryNext
      }
    }));
  };

  const handleResetOrders = async () => {
    const promptMessage = activeLang === 'en' ? 'Enter the reset code' : 'أدخل رمز إعادة ضبط الطلبات';
    const code = global.prompt(promptMessage);
    if (code !== '114477') {
      setUiState({
        resetStatus: 'cancelled',
        resetMessage: translateResetMessage('cancelled'),
        lastResetResponse: null,
        lastResetHistoryEntry: null
      });
      return;
    }
    const state = app.getState ? app.getState() : app.state;
    const branchId = state?.data?.branch?.id || branch.id;
    const payload = {
      branchId,
      moduleId: 'pos',
      tables: DEFAULT_PURGE_TABLES,
      reason: 'finance-reset',
      requestedBy: 'finance-ui',
      resetEvents: true
    };
    setUiState({
      resetStatus: 'pending',
      resetMessage: translateResetMessage('pending'),
      lastResetResponse: null,
      lastResetHistoryEntry: null
    });
    const attemptAt = new Date().toISOString();
    try {
      const response = await fetch('/api/manage/purge-live-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const detailMessage = body?.message
          ? activeLang === 'en'
            ? `Reason: ${body.message}`
            : `السبب: ${body.message}`
          : '';
        setUiState({
          resetStatus: 'error',
          resetMessage: translateResetMessage('failure', { details: detailMessage }),
          lastResetAt: attemptAt,
          lastResetResponse: body || { ok: false, status: response.status },
          lastResetHistoryEntry: null
        });
        console.warn('[POS Finance] Reset orders failed', { payload, response: body, status: response.status });
        return;
      }
      const removed = Number(body?.totalRemoved ?? 0);
      const historySummary = body?.historyEntry && typeof body.historyEntry === 'object' ? body.historyEntry : null;
      const tablesSummary = Array.isArray(historySummary?.tables)
        ? historySummary.tables
            .filter((table) => table && table.name)
            .map((table) => `${table.name}: ${Number(table.count || 0)}`)
            .join(activeLang === 'en' ? ', ' : '، ')
        : '';
      setUiState({
        resetStatus: 'success',
        resetMessage: translateResetMessage('success', { removed, tablesSummary }),
        lastResetAt: attemptAt,
        lastResetResponse: body,
        lastResetHistoryEntry: historySummary
      });
      updateData();
      console.log('[POS Finance] Reset orders completed', { payload, response: body });
    } catch (error) {
      setUiState({
        resetStatus: 'error',
        resetMessage: translateResetMessage('network', { details: error?.message }),
        lastResetAt: attemptAt,
        lastResetResponse: { ok: false, status: 'network-error', error: error?.message },
        lastResetHistoryEntry: null
      });
      console.error('[POS Finance] Reset orders request failed', error);
    }
  };

  const handleCloseDay = async () => {
    const state = app.getState ? app.getState() : app.state;
    const ordersData = db ? ensureArray(db.list('order_header')) : [];
    const paymentsData = db ? ensureArray(db.list('order_payment')) : [];
    const linesData = db ? ensureArray(db.list('order_line')) : [];
    const shiftsData = db ? ensureArray(db.list('pos_shift')) : [];

    const summary = state?.data?.summary || computeFinancialSummary({
      orders: ensureArray(db?.list('order_header') || []),
      payments: ensureArray(db?.list('order_payment') || []),
      shifts: ensureArray(db?.list('pos_shift') || [])
    });
    setUiState({ closingStatus: 'pending', closingMessage: translateCloseMessage('pending') });
    let responsePayload = null;
    try {
      const dataClose = {
        branch: state?.data?.branch || branch,
        summary,
        generatedAt: new Date().toISOString()
      };
      console.log('[POS Finance] Closing payload snapshot', {
        orders: ordersData,
        payments: paymentsData,
        lines: linesData,
        shifts: shiftsData,
        state,
        payload: dataClose
      });
      const response = await fetch('/api/closepos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataClose)
      });
      const body = await response.json().catch(() => null);
      responsePayload = {
        ok: response.ok,
        status: response.status,
        body
      };
      setUiState({
        closingStatus: response.ok ? 'success' : 'error',
        closingMessage: response.ok
          ? translateCloseMessage('success')
          : translateCloseMessage('failure'),
        lastClosingResponse: responsePayload
      });
    } catch (error) {
      responsePayload = { ok: false, status: 'network-error', error: error?.message };
      setUiState({
        closingStatus: 'error',
        closingMessage: translateCloseMessage('network', { details: error?.message }),
        lastClosingResponse: responsePayload
      });
    }
    console.log('[POS Finance] Demo closing response', responsePayload);
  };

  app.setOrders({
    'finance:theme:set': {
      on: ['click'],
      gkeys: ['finance:theme:set'],
      handler: (event) => {
        const btn = event?.target && event.target.closest('[data-theme]');
        if (!btn) return;
        const theme = btn.getAttribute('data-theme');
        setThemePreference(theme);
      }
    },
    'finance:lang:set': {
      on: ['click'],
      gkeys: ['finance:lang:set'],
      handler: (event) => {
        const btn = event?.target && event.target.closest('[data-lang]');
        if (!btn) return;
        const lang = btn.getAttribute('data-lang');
        setLanguagePreference(lang);
      }
    },
    'finance:reset-orders': {
      on: ['click'],
      gkeys: ['finance:reset-orders'],
      handler: handleResetOrders
    },
    'finance:close-day': {
      on: ['click'],
      gkeys: ['finance:close-day'],
      handler: handleCloseDay
    }
  });

  app.mount('#app');

  if (typeof global !== 'undefined') {
    global.addEventListener?.('beforeunload', () => {
      for (const unsubscribe of watchers.splice(0)) {
        try {
          if (typeof unsubscribe === 'function') unsubscribe();
        } catch (_err) {
          /* ignore */
        }
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
