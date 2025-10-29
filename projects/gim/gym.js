import { createPosDb } from '../../static/pos/pos-mini-db.js';
import { div, button, span, input, label, select, option, textarea } from '../../static/lib/mishkah.div.js';
import { createSimpleStore } from '../../static/lib/mishkah.simple-store.js';

const BRANCH_ID = 'gim';
const MODULE_ID = 'gym';

// Global state
let db;
let store;
let currentLang = 'ar';
let currentTheme = 'dark';

// Initialize the application
async function init() {
  // Initialize database
  const result = await createPosDb({
    branchId: BRANCH_ID,
    moduleId: MODULE_ID
  });

  db = result.db;
  await db.ready();

  // Create simple store
  store = createSimpleStore({
    currentPage: 'dashboard',
    selectedMember: null,
    selectedSubscription: null,
    currentLang: 'ar',
    currentTheme: 'dark'
  });

  // Listen to state changes
  store.subscribe(() => {
    renderApp();
  });

  // Set initial theme and lang
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.documentElement.setAttribute('lang', currentLang);
  document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');

  // Initial render
  renderApp();
}

// Translation helper
function t(key) {
  const translations = {
    // Navigation
    dashboard: { ar: 'لوحة التحكم', en: 'Dashboard' },
    members: { ar: 'الأعضاء', en: 'Members' },
    subscriptions: { ar: 'الاشتراكات', en: 'Subscriptions' },
    pos: { ar: 'نقاط البيع', en: 'POS' },
    reports: { ar: 'التقارير', en: 'Reports' },

    // Dashboard
    total_members: { ar: 'إجمالي الأعضاء', en: 'Total Members' },
    active_subscriptions: { ar: 'الاشتراكات النشطة', en: 'Active Subscriptions' },
    expiring_soon: { ar: 'تنتهي قريباً', en: 'Expiring Soon' },
    monthly_revenue: { ar: 'الإيرادات الشهرية', en: 'Monthly Revenue' },
    todays_attendance: { ar: 'حضور اليوم', en: "Today's Attendance" },
    pending_reminders: { ar: 'تذكيرات معلقة', en: 'Pending Reminders' },

    // Members
    member_code: { ar: 'رقم العضو', en: 'Member Code' },
    full_name: { ar: 'الاسم الكامل', en: 'Full Name' },
    phone: { ar: 'الهاتف', en: 'Phone' },
    email: { ar: 'البريد الإلكتروني', en: 'Email' },
    status: { ar: 'الحالة', en: 'Status' },
    actions: { ar: 'الإجراءات', en: 'Actions' },
    add_member: { ar: 'إضافة عضو', en: 'Add Member' },

    // Subscriptions
    plan_name: { ar: 'اسم الخطة', en: 'Plan Name' },
    start_date: { ar: 'تاريخ البداية', en: 'Start Date' },
    end_date: { ar: 'تاريخ الانتهاء', en: 'End Date' },
    amount: { ar: 'المبلغ', en: 'Amount' },
    renew: { ar: 'تجديد', en: 'Renew' },

    // POS
    services: { ar: 'الخدمات', en: 'Services' },
    cart: { ar: 'السلة', en: 'Cart' },
    total: { ar: 'الإجمالي', en: 'Total' },
    checkout: { ar: 'الدفع', en: 'Checkout' },

    // Reports
    revenue_report: { ar: 'تقرير الإيرادات', en: 'Revenue Report' },
    membership_revenue: { ar: 'إيرادات الاشتراكات', en: 'Membership Revenue' },
    service_revenue: { ar: 'إيرادات الخدمات', en: 'Service Revenue' },

    // Common
    save: { ar: 'حفظ', en: 'Save' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
    edit: { ar: 'تعديل', en: 'Edit' },
    delete: { ar: 'حذف', en: 'Delete' },
    view: { ar: 'عرض', en: 'View' },
    active: { ar: 'نشط', en: 'Active' },
    inactive: { ar: 'غير نشط', en: 'Inactive' },
    search: { ar: 'بحث', en: 'Search' },

    // Gym specific
    gym_name: { ar: 'باور فيت للياقة البدنية', en: 'PowerFit Gym' },
    welcome: { ar: 'مرحباً بك', en: 'Welcome' },
    recent_activity: { ar: 'النشاط الأخير', en: 'Recent Activity' },
    renewal_reminders: { ar: 'تذكيرات التجديد', en: 'Renewal Reminders' },
    quick_stats: { ar: 'إحصائيات سريعة', en: 'Quick Stats' },
  };

  return translations[key] ? translations[key][currentLang] : key;
}

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat(currentLang === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0
  }).format(amount);
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(currentLang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

// Main app renderer
function renderApp() {
  const state = store.getState();
  currentLang = state.currentLang;
  currentTheme = state.currentTheme;

  document.documentElement.setAttribute('lang', currentLang);
  document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('data-theme', currentTheme);

  const app = div('.', { class: 'mk-app' }, [
    renderTopBar(),
    div('.', { class: 'mk-main-content' }, [
      renderNavigation(),
      renderPage(state.currentPage)
    ])
  ]);

  document.getElementById('app').replaceChildren(app);
}

// Top bar
function renderTopBar() {
  return div('toolbar', [
    div('toolbar/section', [
      div('hstack', { style: 'gap: 1rem; align-items: center;' }, [
        span('.', { class: 'mk-text-2xl mk-font-bold' }, t('gym_name')),
      ])
    ]),
    div('toolbar/section', [
      div('toolbar/group', [
        button('btn/ghost btn/icon', {
          onclick: () => {
            currentLang = currentLang === 'ar' ? 'en' : 'ar';
            store.setState({ currentLang });
          }
        }, currentLang === 'ar' ? '🇬🇧' : '🇸🇦'),
        button('btn/ghost btn/icon', {
          onclick: () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            store.setState({ currentTheme });
          }
        }, currentTheme === 'dark' ? '☀️' : '🌙'),
      ])
    ])
  ]);
}

// Navigation
function renderNavigation() {
  const state = store.getState();
  const pages = ['dashboard', 'members', 'subscriptions', 'pos', 'reports'];

  return div('.', { class: 'mk-nav' }, [
    div('vstack', { style: 'gap: 0.5rem; padding: 1rem;' },
      pages.map(page =>
        button(
          state.currentPage === page ? 'btn/solid' : 'btn/ghost',
          {
            style: 'width: 100%; justify-content: flex-start;',
            onclick: () => store.setState({ currentPage: page })
          },
          t(page)
        )
      )
    )
  ]);
}

// Page router
function renderPage(page) {
  const pages = {
    dashboard: renderDashboard,
    members: renderMembers,
    subscriptions: renderSubscriptions,
    pos: renderPOS,
    reports: renderReports
  };

  return div('.', { class: 'mk-page' }, [
    pages[page] ? pages[page]() : div('.', 'Page not found')
  ]);
}

// Dashboard page
function renderDashboard() {
  const members = db.list('gym_member') || [];
  const subscriptions = db.list('membership_subscription') || [];
  const attendance = db.list('attendance_log') || [];
  const reminders = db.list('reminder') || [];
  const reports = db.list('revenue_report') || [];

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active' || s.status === 'expiring_soon');
  const expiringSoon = subscriptions.filter(s => s.status === 'expiring_soon');
  const pendingReminders = reminders.filter(r => r.status === 'pending');

  // Get today's attendance
  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = attendance.filter(a => a.check_in_time.startsWith(today));

  // Get monthly revenue
  const monthlyReport = reports.find(r => r.report_type === 'monthly');
  const monthlyRevenue = monthlyReport ? monthlyReport.total_revenue : 0;

  return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
    // Header
    div('.', { class: 'mk-text-3xl mk-font-bold' }, t('dashboard')),

    // Stats cards
    div('.', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;'
    }, [
      renderStatCard('👥', t('total_members'), members.length, 'primary'),
      renderStatCard('✅', t('active_subscriptions'), activeSubscriptions.length, 'success'),
      renderStatCard('⚠️', t('expiring_soon'), expiringSoon.length, 'warning'),
      renderStatCard('💰', t('monthly_revenue'), formatCurrency(monthlyRevenue), 'accent'),
      renderStatCard('📊', t('todays_attendance'), todayAttendance.length, 'secondary'),
      renderStatCard('🔔', t('pending_reminders'), pendingReminders.length, 'danger'),
    ]),

    // Recent activity and reminders
    div('.', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem;'
    }, [
      renderRecentActivity(attendance.slice(-5).reverse()),
      renderRenewalReminders(expiringSoon)
    ])
  ]);
}

// Stat card component
function renderStatCard(icon, label, value, variant = 'primary') {
  return div('card', { style: 'padding: 1.5rem;' }, [
    div('hstack', { style: 'justify-content: space-between; align-items: center;' }, [
      div('vstack', { style: 'gap: 0.5rem;' }, [
        span('.', { class: 'mk-text-muted' }, label),
        span('.', { class: 'mk-text-2xl mk-font-bold' }, value)
      ]),
      span('.', { class: 'mk-text-4xl' }, icon)
    ])
  ]);
}

// Recent activity
function renderRecentActivity(recentAttendance) {
  const members = db.list('gym_member') || [];

  return div('card', { style: 'padding: 1.5rem;' }, [
    div('.', { class: 'mk-text-xl mk-font-bold', style: 'margin-bottom: 1rem;' }, t('recent_activity')),
    div('vstack', { style: 'gap: 0.75rem;' },
      recentAttendance.length > 0 ? recentAttendance.map(att => {
        const member = members.find(m => m.id === att.member_id);
        const memberName = member ? member.full_name[currentLang] : 'Unknown';
        const time = new Date(att.check_in_time).toLocaleTimeString(currentLang === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        return div('list/item', [
          div('list/item-leading', '👤'),
          div('list/item-content', [
            div('.', { class: 'mk-font-medium' }, memberName),
            div('.', { class: 'mk-text-sm mk-text-muted' }, `${t('check_in_time' in att ? 'check_in_time' : 'checked_in')}: ${time}`)
          ])
        ]);
      }) : [div('.', { class: 'mk-text-muted' }, currentLang === 'ar' ? 'لا يوجد نشاط حديث' : 'No recent activity')]
    )
  ]);
}

// Renewal reminders
function renderRenewalReminders(expiringSoon) {
  const members = db.list('gym_member') || [];
  const plans = db.list('membership_plan') || [];

  return div('card', { style: 'padding: 1.5rem;' }, [
    div('.', { class: 'mk-text-xl mk-font-bold', style: 'margin-bottom: 1rem;' }, t('renewal_reminders')),
    div('vstack', { style: 'gap: 0.75rem;' },
      expiringSoon.length > 0 ? expiringSoon.map(sub => {
        const member = members.find(m => m.id === sub.member_id);
        const plan = plans.find(p => p.id === sub.plan_id);
        const memberName = member ? member.full_name[currentLang] : 'Unknown';
        const planName = plan ? plan.plan_name[currentLang] : 'Unknown';
        const endDate = formatDate(sub.end_date);

        return div('list/item', [
          div('list/item-leading', '⚠️'),
          div('list/item-content', [
            div('.', { class: 'mk-font-medium' }, memberName),
            div('.', { class: 'mk-text-sm mk-text-muted' }, `${planName} - ${endDate}`)
          ]),
          div('list/item-trailing', [
            button('btn/sm btn/soft', {
              onclick: () => {
                store.setState({
                  currentPage: 'subscriptions',
                  selectedSubscription: sub.id
                });
              }
            }, t('renew'))
          ])
        ]);
      }) : [div('.', { class: 'mk-text-muted' }, currentLang === 'ar' ? 'لا توجد اشتراكات تنتهي قريباً' : 'No subscriptions expiring soon')]
    )
  ]);
}

// Members page
function renderMembers() {
  const members = db.list('gym_member') || [];

  return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
    // Header
    div('hstack', { style: 'justify-content: space-between; align-items: center;' }, [
      div('.', { class: 'mk-text-3xl mk-font-bold' }, t('members')),
      button('btn/solid', { onclick: () => alert('Add member functionality') }, t('add_member'))
    ]),

    // Search bar
    div('.', { style: 'margin-bottom: 1rem;' }, [
      input('input', {
        type: 'text',
        placeholder: t('search'),
        style: 'width: 100%; max-width: 400px;'
      })
    ]),

    // Members table
    div('card', { style: 'overflow-x: auto;' }, [
      div('.', { class: 'mk-table-container' }, [
        renderMembersTable(members)
      ])
    ])
  ]);
}

// Members table
function renderMembersTable(members) {
  const table = document.createElement('table');
  table.className = 'mk-table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  [t('member_code'), t('full_name'), t('phone'), t('email'), t('status'), t('actions')].forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '1rem';
    th.style.textAlign = currentLang === 'ar' ? 'right' : 'left';
    th.style.borderBottom = '1px solid var(--mk-border)';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  members.forEach(member => {
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--mk-border)';

    // Member code
    const codeCell = document.createElement('td');
    codeCell.textContent = member.member_code;
    codeCell.style.padding = '1rem';
    row.appendChild(codeCell);

    // Full name
    const nameCell = document.createElement('td');
    nameCell.textContent = member.full_name[currentLang];
    nameCell.style.padding = '1rem';
    nameCell.style.fontWeight = '500';
    row.appendChild(nameCell);

    // Phone
    const phoneCell = document.createElement('td');
    phoneCell.textContent = member.phone;
    phoneCell.style.padding = '1rem';
    row.appendChild(phoneCell);

    // Email
    const emailCell = document.createElement('td');
    emailCell.textContent = member.email;
    emailCell.style.padding = '1rem';
    row.appendChild(emailCell);

    // Status
    const statusCell = document.createElement('td');
    statusCell.style.padding = '1rem';
    const statusBadge = span('badge', member.status === 'active' ? t('active') : t('inactive'));
    statusBadge.style.backgroundColor = member.status === 'active' ? 'var(--mk-success)' : 'var(--mk-muted)';
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    // Actions
    const actionsCell = document.createElement('td');
    actionsCell.style.padding = '1rem';
    const actionsDiv = div('hstack', { style: 'gap: 0.5rem;' }, [
      button('btn/sm btn/ghost', { onclick: () => viewMember(member) }, t('view')),
      button('btn/sm btn/ghost', { onclick: () => editMember(member) }, t('edit'))
    ]);
    actionsCell.appendChild(actionsDiv);
    row.appendChild(actionsCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  return table;
}

function viewMember(member) {
  alert(`View member: ${member.full_name[currentLang]}`);
}

function editMember(member) {
  alert(`Edit member: ${member.full_name[currentLang]}`);
}

// Subscriptions page
function renderSubscriptions() {
  const subscriptions = db.list('membership_subscription') || [];
  const members = db.list('gym_member') || [];
  const plans = db.list('membership_plan') || [];

  return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
    // Header
    div('.', { class: 'mk-text-3xl mk-font-bold' }, t('subscriptions')),

    // Subscriptions list
    div('.', {
      style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem;'
    }, subscriptions.map(sub => {
      const member = members.find(m => m.id === sub.member_id);
      const plan = plans.find(p => p.id === sub.plan_id);

      return renderSubscriptionCard(sub, member, plan);
    }))
  ]);
}

// Subscription card
function renderSubscriptionCard(subscription, member, plan) {
  const isExpiring = subscription.status === 'expiring_soon';
  const memberName = member ? member.full_name[currentLang] : 'Unknown';
  const planName = plan ? plan.plan_name[currentLang] : 'Unknown';

  return div('card', {
    style: `padding: 1.5rem; ${isExpiring ? 'border: 2px solid var(--mk-warning);' : ''}`
  }, [
    div('vstack', { style: 'gap: 1rem;' }, [
      // Member name and status
      div('hstack', { style: 'justify-content: space-between; align-items: center;' }, [
        div('.', { class: 'mk-text-xl mk-font-bold' }, memberName),
        span(
          'badge',
          { style: `background: ${isExpiring ? 'var(--mk-warning)' : 'var(--mk-success)'};` },
          isExpiring ? t('expiring_soon') : t('active')
        )
      ]),

      // Plan details
      div('vstack', { style: 'gap: 0.5rem;' }, [
        div('hstack', { style: 'justify-content: space-between;' }, [
          span('.', { class: 'mk-text-muted' }, t('plan_name')),
          span('.', { class: 'mk-font-medium' }, planName)
        ]),
        div('hstack', { style: 'justify-content: space-between;' }, [
          span('.', { class: 'mk-text-muted' }, t('start_date')),
          span('.', formatDate(subscription.start_date))
        ]),
        div('hstack', { style: 'justify-content: space-between;' }, [
          span('.', { class: 'mk-text-muted' }, t('end_date')),
          span('.', formatDate(subscription.end_date))
        ]),
        div('hstack', { style: 'justify-content: space-between;' }, [
          span('.', { class: 'mk-text-muted' }, t('amount')),
          span('.', { class: 'mk-font-bold' }, formatCurrency(subscription.amount_paid))
        ])
      ]),

      // Actions
      div('hstack', { style: 'gap: 0.5rem; margin-top: 0.5rem;' }, [
        button('btn/sm btn/solid', {
          onclick: () => renewSubscription(subscription, member)
        }, t('renew')),
        button('btn/sm btn/ghost', {
          onclick: () => viewSubscription(subscription)
        }, t('view'))
      ])
    ])
  ]);
}

function renewSubscription(subscription, member) {
  alert(`Renew subscription for: ${member.full_name[currentLang]}`);
}

function viewSubscription(subscription) {
  alert(`View subscription: ${subscription.id}`);
}

// POS page
function renderPOS() {
  const services = db.list('gym_service') || [];
  const activeServices = services.filter(s => s.is_active);

  return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
    // Header
    div('.', { class: 'mk-text-3xl mk-font-bold' }, t('pos')),

    // POS content
    div('.', {
      style: 'display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;'
    }, [
      // Services grid
      div('card', { style: 'padding: 1.5rem;' }, [
        div('.', { class: 'mk-text-xl mk-font-bold', style: 'margin-bottom: 1rem;' }, t('services')),
        div('.', {
          style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;'
        }, activeServices.map(service => renderServiceCard(service)))
      ]),

      // Cart
      div('card', { style: 'padding: 1.5rem; height: fit-content;' }, [
        div('.', { class: 'mk-text-xl mk-font-bold', style: 'margin-bottom: 1rem;' }, t('cart')),
        div('vstack', { style: 'gap: 1rem;' }, [
          div('.', { class: 'mk-text-muted' }, currentLang === 'ar' ? 'السلة فارغة' : 'Cart is empty'),
          div('hstack', { style: 'justify-content: space-between; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--mk-border);' }, [
            span('.', { class: 'mk-font-bold' }, t('total')),
            span('.', { class: 'mk-font-bold mk-text-xl' }, formatCurrency(0))
          ]),
          button('btn/solid', { style: 'width: 100%; margin-top: 1rem;' }, t('checkout'))
        ])
      ])
    ])
  ]);
}

// Service card
function renderServiceCard(service) {
  return div('card', {
    style: 'padding: 1rem; cursor: pointer; transition: transform 0.2s;',
    onclick: () => addToCart(service),
    onmouseenter: (e) => e.currentTarget.style.transform = 'scale(1.05)',
    onmouseleave: (e) => e.currentTarget.style.transform = 'scale(1)'
  }, [
    div('vstack', { style: 'gap: 0.5rem;' }, [
      div('.', { class: 'mk-font-bold' }, service.service_name[currentLang]),
      div('.', { class: 'mk-text-sm mk-text-muted' }, service.description[currentLang]),
      div('.', { class: 'mk-font-bold mk-text-lg', style: 'color: var(--mk-primary);' }, formatCurrency(service.price))
    ])
  ]);
}

function addToCart(service) {
  alert(`Added to cart: ${service.service_name[currentLang]}`);
}

// Reports page
function renderReports() {
  const reports = db.list('revenue_report') || [];
  const monthlyReport = reports.find(r => r.report_type === 'monthly');

  if (!monthlyReport) {
    return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
      div('.', { class: 'mk-text-3xl mk-font-bold' }, t('reports')),
      div('.', { class: 'mk-text-muted' }, currentLang === 'ar' ? 'لا توجد تقارير متاحة' : 'No reports available')
    ]);
  }

  return div('vstack', { style: 'gap: 2rem; padding: 2rem;' }, [
    // Header
    div('.', { class: 'mk-text-3xl mk-font-bold' }, t('reports')),

    // Revenue overview
    div('.', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;'
    }, [
      renderStatCard('💰', t('total') + ' ' + t('revenue_report'), formatCurrency(monthlyReport.total_revenue), 'primary'),
      renderStatCard('📋', t('membership_revenue'), formatCurrency(monthlyReport.membership_revenue), 'success'),
      renderStatCard('🛍️', t('service_revenue'), formatCurrency(monthlyReport.service_revenue), 'accent')
    ]),

    // Payment breakdown
    div('card', { style: 'padding: 1.5rem;' }, [
      div('.', { class: 'mk-text-xl mk-font-bold', style: 'margin-bottom: 1rem;' },
        currentLang === 'ar' ? 'تفصيل طرق الدفع' : 'Payment Breakdown'
      ),
      div('vstack', { style: 'gap: 1rem;' }, [
        div('hstack', { style: 'justify-content: space-between;' }, [
          span('.', currentLang === 'ar' ? 'نقدي' : 'Cash'),
          span('.', { class: 'mk-font-bold' }, formatCurrency(monthlyReport.payment_breakdown.cash))
        ]),
        div('hstack', { style: 'justify-content: space-between;' }, [
          span('.', currentLang === 'ar' ? 'بطاقة' : 'Card'),
          span('.', { class: 'mk-font-bold' }, formatCurrency(monthlyReport.payment_breakdown.card))
        ])
      ])
    ]),

    // Metrics
    div('card', { style: 'padding: 1.5rem;' }, [
      div('.', { class: 'mk-text-xl mk-font-bold', style: 'margin-bottom: 1rem;' }, t('quick_stats')),
      div('.', {
        style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;'
      }, [
        renderMetric(currentLang === 'ar' ? 'أعضاء جدد' : 'New Members', monthlyReport.metrics.new_members),
        renderMetric(currentLang === 'ar' ? 'تجديدات' : 'Renewals', monthlyReport.metrics.renewals),
        renderMetric(currentLang === 'ar' ? 'عدد الخدمات' : 'Service Count', monthlyReport.metrics.service_count),
        renderMetric(
          currentLang === 'ar' ? 'متوسط الإيراد/عضو' : 'Avg Revenue/Member',
          formatCurrency(monthlyReport.metrics.average_revenue_per_member)
        )
      ])
    ])
  ]);
}

// Metric component
function renderMetric(label, value) {
  return div('vstack', { style: 'gap: 0.5rem;' }, [
    span('.', { class: 'mk-text-muted' }, label),
    span('.', { class: 'mk-text-2xl mk-font-bold' }, value)
  ]);
}

// Start the app
init();
