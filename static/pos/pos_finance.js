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

  const normalizeMap = (entries = []) => {
    const map = new Map();
    for (const entry of ensureArray(entries)) {
      if (!entry) continue;
      const id = entry.id || entry.code || entry.value || entry.key;
      if (!id) continue;
      map.set(String(id), localizeText(entry.name || entry.status_name || entry.payment_name || entry.type_name || entry.label, defaultLang));
    }
    return map;
  };

  let currentPaymentMethods = ensureArray(initialPayload.payment_methods || initialPayload.paymentMethods).map((method) => ({
    ...method,
    label: localizeText(method?.name, defaultLang)
  }));

  const lookups = {
    statuses: normalizeMap(initialPayload.order_statuses || initialPayload.orderStatuses),
    payments: normalizeMap(initialPayload.order_payment_states || initialPayload.orderPaymentStates),
    types: normalizeMap(initialPayload.order_types || initialPayload.orderTypes)
  };

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
        typeLabel: info.type ? localizeText(info.type_name || info.typeLabel || info.type, defaultLang) : ''
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

  const buildState = ({ orders, payments, lines, shifts, summary, newLookups }) => ({
    head: { title: 'لوحة الإغلاق المالي — Mishkah POS' },
    env: { theme: 'dark', lang: defaultLang, dir: defaultLang === 'en' ? 'ltr' : 'rtl' },
    data: {
      lang: defaultLang,
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
    newLookups: lookups
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
    const paymentMethodsNext = ensureArray(payload.payment_methods || payload.paymentMethods).map((method) => ({
      ...method,
      label: localizeText(method?.name, defaultLang)
    }));
    const nextLookups = {
      statuses: normalizeMap(payload.order_statuses || payload.orderStatuses),
      payments: normalizeMap(payload.order_payment_states || payload.orderPaymentStates),
      types: normalizeMap(payload.order_types || payload.orderTypes)
    };
    if (paymentMethodsNext.length) {
      currentPaymentMethods = paymentMethodsNext;
    }

    app.setState((state) => ({
      ...state,
      data: {
        ...state.data,
        paymentMethods: currentPaymentMethods,
        lookups: nextLookups
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

  const handleResetOrders = async () => {
    const code = global.prompt('أدخل رمز إعادة ضبط الطلبات');
    if (code !== '114477') {
      setUiState({
        resetStatus: 'cancelled',
        resetMessage: 'تم إلغاء إعادة ضبط الطلبات (رمز غير صحيح).',
        lastResetResponse: null
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
      resetMessage: 'جاري إعادة ضبط بيانات الحركات...',
      lastResetResponse: null
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
        const message = body?.message
          ? `تعذر إعادة ضبط بيانات الطلبات: ${body.message}`
          : 'تعذر إعادة ضبط بيانات الطلبات.';
        setUiState({
          resetStatus: 'error',
          resetMessage: message,
          lastResetAt: attemptAt,
          lastResetResponse: body || { ok: false, status: response.status }
        });
        console.warn('[POS Finance] Reset orders failed', { payload, response: body, status: response.status });
        return;
      }
      const removed = Number(body?.totalRemoved ?? 0);
      const message = `تمت إعادة ضبط بيانات الحركات بنجاح (${removed} سجل).`;
      setUiState({
        resetStatus: 'success',
        resetMessage: message,
        lastResetAt: attemptAt,
        lastResetResponse: body
      });
      updateData();
      console.log('[POS Finance] Reset orders completed', { payload, response: body });
    } catch (error) {
      setUiState({
        resetStatus: 'error',
        resetMessage: 'تعذر الاتصال بخادم إعادة الضبط.',
        lastResetAt: attemptAt,
        lastResetResponse: { ok: false, status: 'network-error', error: error?.message }
      });
      console.error('[POS Finance] Reset orders request failed', error);
    }
  };

  const handleCloseDay = async () => {
    const state = app.getState ? app.getState() : app.state;
     let orders_data = db ? ensureArray(db.list('order_header')) : [];
    let  payments_data = db ? ensureArray(db.list('order_payment')) : [];
    let  lines_data = db ? ensureArray(db.list('order_line')) : [];
    let  shifts_data = db ? ensureArray(db.list('pos_shift')) : [];

    
    const summary = state?.data?.summary || computeFinancialSummary({
      orders: ensureArray(db?.list('order_header') || []),
      payments: ensureArray(db?.list('order_payment') || []),
      shifts: ensureArray(db?.list('pos_shift') || [])
    });
    setUiState({ closingStatus: 'pending', closingMessage: 'جاري إرسال بيانات الإغلاق...' });
    let responsePayload = null;
    try {
      let dataClose={
          branch: state?.data?.branch || branch,
          summary,
          generatedAt: new Date().toISOString()
        };
      console.log(orders_data,payments_data,lines_data,shifts_data,state,dataClose)
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
        closingMessage: response.ok ? 'تم إرسال الإغلاق بنجاح (تجريبي).' : 'فشل إرسال الإغلاق التجريبي.' ,
        lastClosingResponse: responsePayload
      });
    } catch (error) {
      responsePayload = { ok: false, status: 'network-error', error: error?.message };
      setUiState({
        closingStatus: 'error',
        closingMessage: 'تعذر الوصول إلى نقطة الإغلاق التجريبية.',
        lastClosingResponse: responsePayload
      });
    }
    console.log('اغلاق تجريبي', responsePayload);
  };

  app.setOrders({
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
