(async function() {
  // Access Mishkah global objects
  const M = Mishkah;
  const UI = M.UI;
  const U = M.utils;
  const { tw, token } = U.twcss || {};

  // Get database from window
  const db = window.__GYM_DB__;
  if (!db) {
    console.error('[GYM] Database not initialized');
    return;
  }

  // State
  let currentPage = 'dashboard';
  let currentLang = 'ar';
  let currentTheme = 'dark';
  let selectedMember = null;

  // Translations
  const t = {
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
    recent_activity: { ar: 'النشاط الأخير', en: 'Recent Activity' },
    renewal_reminders: { ar: 'تذكيرات التجديد', en: 'Renewal Reminders' },

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
    gym_name: { ar: 'باور فيت للياقة البدنية', en: 'PowerFit Gym' },
    welcome: { ar: 'مرحباً بك', en: 'Welcome' }
  };

  // Localize helper
  function localize(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[currentLang] || obj.ar || obj.en || '';
  }

  // Format currency
  function formatCurrency(amount) {
    return new Intl.NumberFormat(currentLang === 'ar' ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0
    }).format(amount || 0);
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

  // Toggle language
  function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.setAttribute('lang', currentLang);
    document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
    render();
  }

  // Toggle theme
  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    render();
  }

  // Navigate to page
  function navigate(page) {
    currentPage = page;
    render();
  }

  // Render stat card
  function renderStatCard(icon, label, value, variant = 'primary') {
    const card = document.createElement('div');
    card.className = tw ? tw`p-6 rounded-lg` : 'stat-card';
    card.style.cssText = `
      padding: 1.5rem;
      border-radius: 0.5rem;
      background: var(--mk-surface-1);
      border: 1px solid var(--mk-border);
    `;

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <span style="color: var(--mk-muted); font-size: 0.875rem;">${label}</span>
          <span style="font-size: 1.5rem; font-weight: 700;">${value}</span>
        </div>
        <span style="font-size: 2.5rem;">${icon}</span>
      </div>
    `;

    return card;
  }

  // Render dashboard
  function renderDashboard() {
    const members = db.list('gym_member') || [];
    const subscriptions = db.list('membership_subscription') || [];
    const attendance = db.list('attendance_log') || [];
    const reminders = db.list('reminder') || [];
    const reports = db.list('revenue_report') || [];

    const activeSubscriptions = subscriptions.filter(s => s.status === 'active' || s.status === 'expiring_soon');
    const expiringSoon = subscriptions.filter(s => s.status === 'expiring_soon');
    const pendingReminders = reminders.filter(r => r.status === 'pending');

    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = attendance.filter(a => a.check_in_time.startsWith(today));

    const monthlyReport = reports.find(r => r.report_type === 'monthly');
    const monthlyRevenue = monthlyReport ? monthlyReport.total_revenue : 0;

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 2rem; padding: 2rem; overflow-y: auto; height: 100%;';

    // Header
    const header = document.createElement('h1');
    header.style.cssText = 'font-size: 1.875rem; font-weight: 700; margin: 0;';
    header.textContent = localize(t.dashboard);
    container.appendChild(header);

    // Stats grid
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;';

    statsGrid.appendChild(renderStatCard('👥', localize(t.total_members), members.length));
    statsGrid.appendChild(renderStatCard('✅', localize(t.active_subscriptions), activeSubscriptions.length));
    statsGrid.appendChild(renderStatCard('⚠️', localize(t.expiring_soon), expiringSoon.length));
    statsGrid.appendChild(renderStatCard('💰', localize(t.monthly_revenue), formatCurrency(monthlyRevenue)));
    statsGrid.appendChild(renderStatCard('📊', localize(t.todays_attendance), todayAttendance.length));
    statsGrid.appendChild(renderStatCard('🔔', localize(t.pending_reminders), pendingReminders.length));

    container.appendChild(statsGrid);

    // Activity section
    const activitySection = document.createElement('div');
    activitySection.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem;';

    // Recent activity card
    const activityCard = document.createElement('div');
    activityCard.style.cssText = `
      padding: 1.5rem;
      border-radius: 0.5rem;
      background: var(--mk-surface-1);
      border: 1px solid var(--mk-border);
    `;
    activityCard.innerHTML = `
      <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem 0;">${localize(t.recent_activity)}</h2>
      <div style="color: var(--mk-muted);">${todayAttendance.length > 0 ? `${todayAttendance.length} عضو حضر اليوم` : 'لا يوجد نشاط اليوم'}</div>
    `;
    activitySection.appendChild(activityCard);

    // Renewal reminders card
    const remindersCard = document.createElement('div');
    remindersCard.style.cssText = `
      padding: 1.5rem;
      border-radius: 0.5rem;
      background: var(--mk-surface-1);
      border: 1px solid var(--mk-border);
    `;
    remindersCard.innerHTML = `
      <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem 0;">${localize(t.renewal_reminders)}</h2>
      <div style="color: var(--mk-muted);">${expiringSoon.length} اشتراك ينتهي قريباً</div>
    `;
    activitySection.appendChild(remindersCard);

    container.appendChild(activitySection);

    return container;
  }

  // Render members list
  function renderMembers() {
    const members = db.list('gym_member') || [];

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 2rem; padding: 2rem; overflow-y: auto; height: 100%;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
    header.innerHTML = `
      <h1 style="font-size: 1.875rem; font-weight: 700; margin: 0;">${localize(t.members)}</h1>
      <button style="
        padding: 0.75rem 1.5rem;
        background: var(--mk-primary);
        color: white;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        font-size: 1rem;
      ">${localize(t.add_member)}</button>
    `;
    container.appendChild(header);

    // Members grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;';

    members.forEach(member => {
      const card = document.createElement('div');
      card.style.cssText = `
        padding: 1.5rem;
        border-radius: 0.5rem;
        background: var(--mk-surface-1);
        border: 1px solid var(--mk-border);
        cursor: pointer;
        transition: transform 0.2s;
      `;
      card.onmouseenter = () => card.style.transform = 'translateY(-2px)';
      card.onmouseleave = () => card.style.transform = 'translateY(0)';

      const statusColor = member.status === 'active' ? 'var(--mk-success)' : 'var(--mk-muted)';

      card.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700;">${localize(member.full_name)}</div>
              <div style="color: var(--mk-muted); font-size: 0.875rem;">${member.member_code}</div>
            </div>
            <span style="
              padding: 0.25rem 0.75rem;
              background: ${statusColor};
              color: white;
              border-radius: 9999px;
              font-size: 0.75rem;
              font-weight: 600;
            ">${localize(t[member.status])}</span>
          </div>
          <div style="color: var(--mk-muted); font-size: 0.875rem;">
            <div>📞 ${member.phone}</div>
            <div>📧 ${member.email}</div>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
    return container;
  }

  // Render subscriptions
  function renderSubscriptions() {
    const subscriptions = db.list('membership_subscription') || [];
    const members = db.list('gym_member') || [];
    const plans = db.list('membership_plan') || [];

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 2rem; padding: 2rem; overflow-y: auto; height: 100%;';

    // Header
    const header = document.createElement('h1');
    header.style.cssText = 'font-size: 1.875rem; font-weight: 700; margin: 0;';
    header.textContent = localize(t.subscriptions);
    container.appendChild(header);

    // Subscriptions grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 1.5rem;';

    subscriptions.forEach(sub => {
      const member = members.find(m => m.id === sub.member_id);
      const plan = plans.find(p => p.id === sub.plan_id);

      const isExpiring = sub.status === 'expiring_soon';
      const borderColor = isExpiring ? 'var(--mk-warning)' : 'var(--mk-border)';

      const card = document.createElement('div');
      card.style.cssText = `
        padding: 1.5rem;
        border-radius: 0.5rem;
        background: var(--mk-surface-1);
        border: 2px solid ${borderColor};
      `;

      card.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 1.25rem; font-weight: 700;">${member ? localize(member.full_name) : 'Unknown'}</div>
            <span style="
              padding: 0.25rem 0.75rem;
              background: ${isExpiring ? 'var(--mk-warning)' : 'var(--mk-success)'};
              color: white;
              border-radius: 9999px;
              font-size: 0.75rem;
              font-weight: 600;
            ">${isExpiring ? localize(t.expiring_soon) : localize(t.active)}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.875rem;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--mk-muted);">${localize(t.plan_name)}</span>
              <span>${plan ? localize(plan.plan_name) : 'Unknown'}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--mk-muted);">${localize(t.start_date)}</span>
              <span>${formatDate(sub.start_date)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--mk-muted);">${localize(t.end_date)}</span>
              <span>${formatDate(sub.end_date)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--mk-muted);">${localize(t.amount)}</span>
              <span style="font-weight: 700;">${formatCurrency(sub.amount_paid)}</span>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button style="
              flex: 1;
              padding: 0.5rem 1rem;
              background: var(--mk-primary);
              color: white;
              border: none;
              border-radius: 0.375rem;
              cursor: pointer;
              font-size: 0.875rem;
            ">${localize(t.renew)}</button>
            <button style="
              flex: 1;
              padding: 0.5rem 1rem;
              background: transparent;
              color: var(--mk-fg);
              border: 1px solid var(--mk-border);
              border-radius: 0.375rem;
              cursor: pointer;
              font-size: 0.875rem;
            ">${localize(t.view)}</button>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
    return container;
  }

  // Render POS
  function renderPOS() {
    const services = db.list('gym_service') || [];
    const activeServices = services.filter(s => s.is_active);

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 2rem; padding: 2rem; overflow-y: auto; height: 100%;';

    // Header
    const header = document.createElement('h1');
    header.style.cssText = 'font-size: 1.875rem; font-weight: 700; margin: 0;';
    header.textContent = localize(t.pos);
    container.appendChild(header);

    // Services grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem;';

    activeServices.forEach(service => {
      const card = document.createElement('div');
      card.style.cssText = `
        padding: 1.5rem;
        border-radius: 0.5rem;
        background: var(--mk-surface-1);
        border: 1px solid var(--mk-border);
        cursor: pointer;
        transition: all 0.2s;
      `;
      card.onmouseenter = () => {
        card.style.transform = 'scale(1.05)';
        card.style.borderColor = 'var(--mk-primary)';
      };
      card.onmouseleave = () => {
        card.style.transform = 'scale(1)';
        card.style.borderColor = 'var(--mk-border)';
      };

      card.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <div style="font-weight: 700; font-size: 1.125rem;">${localize(service.service_name)}</div>
          <div style="color: var(--mk-muted); font-size: 0.875rem;">${localize(service.description)}</div>
          <div style="color: var(--mk-primary); font-weight: 700; font-size: 1.25rem; margin-top: 0.5rem;">
            ${formatCurrency(service.price)}
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
    return container;
  }

  // Render reports
  function renderReports() {
    const reports = db.list('revenue_report') || [];
    const monthlyReport = reports.find(r => r.report_type === 'monthly');

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 2rem; padding: 2rem; overflow-y: auto; height: 100%;';

    // Header
    const header = document.createElement('h1');
    header.style.cssText = 'font-size: 1.875rem; font-weight: 700; margin: 0;';
    header.textContent = localize(t.reports);
    container.appendChild(header);

    if (!monthlyReport) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color: var(--mk-muted); text-align: center; padding: 4rem;';
      empty.textContent = currentLang === 'ar' ? 'لا توجد تقارير متاحة' : 'No reports available';
      container.appendChild(empty);
      return container;
    }

    // Stats grid
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;';

    statsGrid.appendChild(renderStatCard('💰', localize(t.total) + ' ' + localize(t.revenue_report), formatCurrency(monthlyReport.total_revenue)));
    statsGrid.appendChild(renderStatCard('📋', localize(t.membership_revenue), formatCurrency(monthlyReport.membership_revenue)));
    statsGrid.appendChild(renderStatCard('🛍️', localize(t.service_revenue), formatCurrency(monthlyReport.service_revenue)));

    container.appendChild(statsGrid);

    // Payment breakdown
    const breakdownCard = document.createElement('div');
    breakdownCard.style.cssText = `
      padding: 1.5rem;
      border-radius: 0.5rem;
      background: var(--mk-surface-1);
      border: 1px solid var(--mk-border);
    `;
    breakdownCard.innerHTML = `
      <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem 0;">
        ${currentLang === 'ar' ? 'تفصيل طرق الدفع' : 'Payment Breakdown'}
      </h2>
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="display: flex; justify-content: space-between;">
          <span>${currentLang === 'ar' ? 'نقدي' : 'Cash'}</span>
          <span style="font-weight: 700;">${formatCurrency(monthlyReport.payment_breakdown.cash)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>${currentLang === 'ar' ? 'بطاقة' : 'Card'}</span>
          <span style="font-weight: 700;">${formatCurrency(monthlyReport.payment_breakdown.card)}</span>
        </div>
      </div>
    `;
    container.appendChild(breakdownCard);

    return container;
  }

  // Main render function
  function render() {
    const app = document.getElementById('app');
    if (!app) return;

    // Clear app
    app.innerHTML = '';

    // Create main container
    const shell = document.createElement('div');
    shell.className = 'gym-shell';

    // Top bar
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: var(--mk-surface-1);
      border-bottom: 1px solid var(--mk-border);
    `;
    topBar.innerHTML = `
      <div style="font-size: 1.5rem; font-weight: 700;">${localize(t.gym_name)}</div>
      <div style="display: flex; gap: 0.5rem;">
        <button onclick="window.toggleLang()" style="
          padding: 0.5rem 1rem;
          background: transparent;
          color: var(--mk-fg);
          border: 1px solid var(--mk-border);
          border-radius: 0.375rem;
          cursor: pointer;
          font-size: 1.25rem;
        ">${currentLang === 'ar' ? '🇬🇧' : '🇸🇦'}</button>
        <button onclick="window.toggleTheme()" style="
          padding: 0.5rem 1rem;
          background: transparent;
          color: var(--mk-fg);
          border: 1px solid var(--mk-border);
          border-radius: 0.375rem;
          cursor: pointer;
          font-size: 1.25rem;
        ">${currentTheme === 'dark' ? '☀️' : '🌙'}</button>
      </div>
    `;
    shell.appendChild(topBar);

    // Main content area
    const mainContent = document.createElement('div');
    mainContent.style.cssText = 'display: flex; flex: 1; overflow: hidden;';

    // Navigation
    const nav = document.createElement('nav');
    nav.style.cssText = `
      width: 250px;
      background: var(--mk-surface-1);
      border-${currentLang === 'ar' ? 'left' : 'right'}: 1px solid var(--mk-border);
      padding: 1rem;
      overflow-y: auto;
    `;

    const pages = ['dashboard', 'members', 'subscriptions', 'pos', 'reports'];
    const navButtons = pages.map(page => {
      const isActive = currentPage === page;
      const btn = document.createElement('button');
      btn.style.cssText = `
        width: 100%;
        padding: 0.75rem 1rem;
        margin-bottom: 0.5rem;
        background: ${isActive ? 'var(--mk-primary)' : 'transparent'};
        color: ${isActive ? 'white' : 'var(--mk-fg)'};
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
        text-align: ${currentLang === 'ar' ? 'right' : 'left'};
        font-size: 1rem;
        transition: all 0.2s;
      `;
      btn.textContent = localize(t[page]);
      btn.onclick = () => navigate(page);
      if (!isActive) {
        btn.onmouseenter = () => btn.style.background = 'var(--mk-surface-2)';
        btn.onmouseleave = () => btn.style.background = 'transparent';
      }
      return btn;
    });

    navButtons.forEach(btn => nav.appendChild(btn));
    mainContent.appendChild(nav);

    // Page content
    const pageContent = document.createElement('div');
    pageContent.style.cssText = 'flex: 1; overflow-y: auto; background: var(--mk-surface-0);';

    let content;
    switch (currentPage) {
      case 'dashboard':
        content = renderDashboard();
        break;
      case 'members':
        content = renderMembers();
        break;
      case 'subscriptions':
        content = renderSubscriptions();
        break;
      case 'pos':
        content = renderPOS();
        break;
      case 'reports':
        content = renderReports();
        break;
      default:
        content = renderDashboard();
    }

    pageContent.appendChild(content);
    mainContent.appendChild(pageContent);

    shell.appendChild(mainContent);
    app.appendChild(shell);
  }

  // Expose functions to window
  window.toggleLang = toggleLanguage;
  window.toggleTheme = toggleTheme;

  // Initial render
  render();

  console.log('[GYM] Application initialized successfully');
})();
