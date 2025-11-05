(function() {
  'use strict';

  console.log('🚀 [KDS v2] Starting...');

  // ==================== Config ====================
  const params = new URLSearchParams(window.location.search || '');
  const BRANCH_ID = (params.get('brname') || 'dar').trim();

  // ==================== State ====================
  const state = {
    connected: false,
    activeTab: 'prep',
    sections: [],
    menuItems: [],
    orders: [],
    lines: [],
    jobs: new Map(),
    handoff: {},
    deliveries: { assignments: {}, settlements: {} },
    lang: 'ar'
  };

  const MANUAL_STAGES = {
    prep: { id: 'prep', nameAr: 'التحضير', nameEn: 'Preparation' },
    expo: { id: 'expo', nameAr: 'التجميع', nameEn: 'Expeditor' },
    handoff: { id: 'handoff', nameAr: 'التسليم', nameEn: 'Service Handoff' },
    delivery: { id: 'delivery', nameAr: 'تسليم الدليفري', nameEn: 'Delivery Handoff' },
    'delivery-pending': { id: 'delivery-pending', nameAr: 'معلقات الدليفري', nameEn: 'Delivery Settlements' }
  };

  // ==================== Helpers ====================
  function formatTime(ms) {
    if (!ms) return '00:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getTimeSinceCreated(createdAt) {
    if (!createdAt) return 0;
    const created = new Date(createdAt).getTime();
    return Date.now() - created;
  }

  function getTimeClass(ms) {
    if (ms > 20 * 60 * 1000) return 'danger';
    if (ms > 10 * 60 * 1000) return 'warning';
    return '';
  }

  // ==================== Data Loading ====================
  function loadReferenceData() {
    console.log('📦 [KDS v2] Loading reference data from window.database...');

    const database = window.database || {};

    // Load kitchen sections
    state.sections = database.kitchen_sections || [];
    console.log(`✅ Loaded ${state.sections.length} kitchen sections`);

    // Load menu items
    state.menuItems = database.menu_items || [];
    console.log(`✅ Loaded ${state.menuItems.length} menu items`);

    if (state.sections.length > 0 && state.menuItems.length > 0) {
      renderTabs();
    }
  }

  // Wait for window.database to be ready
  function waitForDatabase() {
    const status = window.__POS_DATA_STATUS__;

    if (status && status.status === 'ready' && window.database) {
      console.log('✅ [KDS v2] Database ready');
      loadReferenceData();
      return true;
    }

    console.log('⏳ [KDS v2] Waiting for database...');
    return false;
  }

  // Check immediately, then poll
  if (!waitForDatabase()) {
    const checkInterval = setInterval(() => {
      if (waitForDatabase()) {
        clearInterval(checkInterval);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkInterval);
      if (state.sections.length === 0 || state.menuItems.length === 0) {
        console.error('❌ [KDS v2] Timeout waiting for database');
      }
    }, 10000);
  }

  // ==================== CRUD Connection ====================
  let crud = null;
  let store = null;

  async function connectToCRUD() {
    try {
      console.log(`🔌 [KDS v2] Connecting to CRUD (branch: ${BRANCH_ID})...`);

      crud = window.createCRUD({ branchId: BRANCH_ID, moduleId: 'pos' });
      store = await crud.connect();

      console.log('✅ [KDS v2] Connected to CRUD');
      state.connected = true;
      updateConnectionStatus();

      // Watch for changes
      setupWatchers();

    } catch (error) {
      console.error('❌ [KDS v2] Connection failed:', error);
      state.connected = false;
      updateConnectionStatus();
    }
  }

  function setupWatchers() {
    console.log('👀 [KDS v2] Setting up watchers...');

    // Watch order headers
    crud.watch('order_header', (records) => {
      console.log(`📥 [KDS v2] order_header: ${records ? records.length : 0} records`);
      state.orders = records || [];
      processOrders();
    });

    // Watch order lines
    crud.watch('order_line', (records) => {
      console.log(`📥 [KDS v2] order_line: ${records ? records.length : 0} records`);
      state.lines = records || [];
      processOrders();
    });
  }

  // ==================== Order Processing ====================
  function processOrders() {
    if (!state.orders || !state.lines) return;
    if (state.menuItems.length === 0 || state.sections.length === 0) return;

    console.log(`🔄 [KDS v2] Processing ${state.orders.length} orders, ${state.lines.length} lines`);

    // Clear jobs
    state.jobs.clear();

    // Create index for menu items
    const itemsIndex = {};
    state.menuItems.forEach(item => {
      itemsIndex[item.id] = item;
    });

    // Group lines by orderId and sectionId
    state.lines.forEach((line) => {
      const orderId = line.orderId || line.order_id || line.order_header_id;
      const sectionId = line.kitchenSectionId || line.kitchen_section_id || line.sectionId || line.section_id;

      if (!orderId || !sectionId) return;

      // Find order header
      const order = state.orders.find(o => o.id === orderId);
      if (!order) return;

      // Get item details
      const itemId = line.itemId || line.item_id;
      const menuItem = itemId ? itemsIndex[itemId] : null;

      const nameAr = menuItem?.item_name?.ar || menuItem?.nameAr || menuItem?.name_ar || itemId || 'صنف';
      const nameEn = menuItem?.item_name?.en || menuItem?.nameEn || menuItem?.name_en || itemId || 'Item';

      // Create job ID
      const jobId = `${orderId}:${sectionId}`;

      // Get or create job
      if (!state.jobs.has(jobId)) {
        state.jobs.set(jobId, {
          id: jobId,
          orderId: orderId,
          orderNumber: order.orderNumber || order.order_number || orderId,
          sectionId: sectionId,
          serviceMode: order.serviceMode || order.service_mode || 'dine_in',
          tableLabel: order.tableLabel || order.table_label || '',
          customerName: order.customerName || order.customer_name || '',
          status: 'queued',
          createdAt: order.createdAt || order.created_at,
          items: [],
          totalItems: 0,
          completedItems: 0
        });
      }

      const job = state.jobs.get(jobId);

      // Add item to job
      job.items.push({
        id: line.id,
        itemId: itemId,
        nameAr: nameAr,
        nameEn: nameEn,
        quantity: line.quantity || 1,
        notes: line.notes || '',
        status: line.statusId || line.status_id || 'queued'
      });

      job.totalItems += (line.quantity || 1);
      const itemStatus = line.statusId || line.status_id || 'queued';
      if (itemStatus === 'ready' || itemStatus === 'completed') {
        job.completedItems += (line.quantity || 1);
      }
    });

    // Update job statuses
    state.jobs.forEach(job => {
      if (job.completedItems >= job.totalItems && job.totalItems > 0) {
        job.status = 'ready';
      } else if (job.completedItems > 0) {
        job.status = 'cooking';
      } else {
        job.status = 'queued';
      }
    });

    console.log(`✅ [KDS v2] Created ${state.jobs.size} jobs`);

    renderTabs();
    renderOrders();
  }

  // ==================== UI Rendering ====================
  function updateConnectionStatus() {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (state.connected) {
      indicator.classList.add('connected');
      text.textContent = 'متصل';
    } else {
      indicator.classList.remove('connected');
      text.textContent = 'غير متصل';
    }
  }

  function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    const tabs = [];

    // Add 'prep' tab
    const prepOrders = state.orders.filter(order => !state.handoff[order.id]);
    tabs.push({
      id: 'prep',
      nameAr: MANUAL_STAGES.prep.nameAr,
      nameEn: MANUAL_STAGES.prep.nameEn,
      count: prepOrders.length
    });

    // Add kitchen section tabs
    state.sections.forEach(section => {
      const count = Array.from(state.jobs.values()).filter(job =>
        job.sectionId === section.id && !state.handoff[job.orderId]
      ).length;

      const nameAr = section.section_name?.ar || section.nameAr || section.name_ar || section.id;
      const nameEn = section.section_name?.en || section.nameEn || section.name_en || section.id;

      tabs.push({
        id: section.id,
        nameAr: nameAr,
        nameEn: nameEn,
        count: count
      });
    });

    // Add manual stage tabs
    tabs.push({ id: 'expo', nameAr: MANUAL_STAGES.expo.nameAr, nameEn: MANUAL_STAGES.expo.nameEn, count: 0 });
    tabs.push({ id: 'handoff', nameAr: MANUAL_STAGES.handoff.nameAr, nameEn: MANUAL_STAGES.handoff.nameEn, count: 0 });
    tabs.push({ id: 'delivery', nameAr: MANUAL_STAGES.delivery.nameAr, nameEn: MANUAL_STAGES.delivery.nameEn, count: 0 });
    tabs.push({ id: 'delivery-pending', nameAr: MANUAL_STAGES['delivery-pending'].nameAr, nameEn: MANUAL_STAGES['delivery-pending'].nameEn, count: 0 });

    container.innerHTML = tabs.map(tab => {
      const displayName = state.lang === 'ar' ? tab.nameAr : tab.nameEn;
      return `
        <button class="tab ${state.activeTab === tab.id ? 'active' : ''}" onclick="window.switchTab('${tab.id}')">
          ${tab.count > 0 ? `<span class="tab-badge">${tab.count}</span>` : ''}
          ${displayName}
        </button>
      `;
    }).join('');
  }

  function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    // Filter jobs for active tab
    let filteredJobs = Array.from(state.jobs.values());

    if (state.activeTab === 'prep') {
      filteredJobs = filteredJobs.filter(job => !state.handoff[job.orderId]);
    } else if (state.activeTab !== 'expo' && state.activeTab !== 'handoff' && state.activeTab !== 'delivery' && state.activeTab !== 'delivery-pending') {
      filteredJobs = filteredJobs.filter(job =>
        job.sectionId === state.activeTab && !state.handoff[job.orderId]
      );
    }

    // Filter out completed jobs
    filteredJobs = filteredJobs.filter(job => job.status !== 'completed');

    // Sort by created time
    filteredJobs.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    });

    if (filteredJobs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🍽️</div>
          <div class="empty-state-text">لا توجد طلبات حالياً</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredJobs.map(job => renderOrderCard(job)).join('');
  }

  function renderOrderCard(job) {
    const timeSince = getTimeSinceCreated(job.createdAt);
    const timeClass = getTimeClass(timeSince);
    const section = state.sections.find(s => s.id === job.sectionId);
    const sectionName = section ? (
      section.section_name?.ar || section.nameAr || section.name_ar || section.id
    ) : job.sectionId;

    return `
      <div class="order-card ${timeSince > 20 * 60 * 1000 ? 'urgent' : ''}">
        <div class="order-header">
          <div>
            <div class="order-number">${job.orderNumber}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              ${sectionName}
            </div>
          </div>
          <div class="order-time ${timeClass}">
            ⏱️ ${formatTime(timeSince)}
          </div>
        </div>

        <div class="order-items">
          ${job.items.map(item => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${state.lang === 'ar' ? item.nameAr : item.nameEn}
                </div>
                <div class="item-quantity">× ${item.quantity}</div>
              </div>
              ${item.notes ? `<div class="item-notes">📝 ${item.notes}</div>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          ${renderActionButtons(job)}
        </div>
      </div>
    `;
  }

  function renderActionButtons(job) {
    if (job.status === 'queued') {
      return `<button class="btn btn-start" onclick="window.startJob('${job.id}')">🔥 بدء التجهيز</button>`;
    }
    if (job.status === 'cooking') {
      return `<button class="btn btn-ready" onclick="window.markJobReady('${job.id}')">✅ تم التجهيز</button>`;
    }
    if (job.status === 'ready') {
      return `<button class="btn btn-bump" onclick="window.bumpJob('${job.id}')">📦 تم التجميع</button>`;
    }
    return '';
  }

  // ==================== Actions ====================
  window.switchTab = function(tabId) {
    state.activeTab = tabId;
    renderTabs();
    renderOrders();
  };

  window.startJob = async function(jobId) {
    const job = state.jobs.get(jobId);
    if (!job) return;

    for (const item of job.items) {
      try {
        await crud.update('order_line', { id: item.id, statusId: 'cooking' });
      } catch (err) {
        console.error('Error updating line:', err);
      }
    }
  };

  window.markJobReady = async function(jobId) {
    const job = state.jobs.get(jobId);
    if (!job) return;

    for (const item of job.items) {
      try {
        await crud.update('order_line', { id: item.id, statusId: 'ready' });
      } catch (err) {
        console.error('Error updating line:', err);
      }
    }
  };

  window.bumpJob = async function(jobId) {
    const job = state.jobs.get(jobId);
    if (!job) return;

    for (const item of job.items) {
      try {
        await crud.update('order_line', { id: item.id, statusId: 'completed' });
      } catch (err) {
        console.error('Error updating line:', err);
      }
    }
  };

  // ==================== Initialize ====================
  connectToCRUD();

  // Auto-refresh timer
  setInterval(() => {
    renderOrders();
  }, 1000);

  console.log('✅ [KDS v2] Initialized');
})();
