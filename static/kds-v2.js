(async function() {
  'use strict';

  // ==================== Configuration ====================
  const CONFIG = {
    branchId: 'dar',
    moduleId: 'pos',
    role: 'kds-station',
    // Use relative path - let the system determine correct URL
    wsPath: '/ws'
  };

  // ==================== State ====================
  const state = {
    connected: false,
    activeTab: 'prep', // Default to prep view
    sections: [],      // kitchen_section table
    menuItems: [],     // menu_item table (for item names)
    orders: [],        // order_header table
    lines: [],         // order_line table
    jobs: new Map(),
    handoff: {},  // For tracking assembled/served orders
    deliveries: { assignments: {}, settlements: {} },
    lang: 'ar'
  };

  // Manual sections/stages
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
    if (ms > 20 * 60 * 1000) return 'danger';  // > 20 minutes
    if (ms > 10 * 60 * 1000) return 'warning'; // > 10 minutes
    return '';
  }

  // ==================== Database Setup ====================
  console.log('[KDS v2] Initializing database...');

  // Get schema from window.database if available
  const database = typeof window !== 'undefined' ? (window.database || {}) : {};
  const posSchema = database.schema || database.pos_schema || null;

  // 🔍 DEBUG: Print schema structure
  console.log('═══════════════════════════════════════════════════');
  console.log('🔍 [DEBUG] window.database:', database);
  console.log('🔍 [DEBUG] window.database keys:', Object.keys(database));
  console.log('🔍 [DEBUG] posSchema:', posSchema);
  if (posSchema && posSchema.tables) {
    console.log('🔍 [DEBUG] Schema tables:', posSchema.tables.map(t => t.name || t.sqlName));
  }
  console.log('═══════════════════════════════════════════════════');

  let db;
  if (posSchema && typeof createDBAuto === 'function') {
    // Use createDBAuto for automatic table registration
    // NOTE: Only watch live tables (order_header, order_line)
    // Reference data (menu_item, kitchen_section) loaded from window.database
    console.log('[KDS v2] Using createDBAuto with schema');
    db = createDBAuto(posSchema, ['order_header', 'order_line'], {
      branchId: CONFIG.branchId,
      moduleId: CONFIG.moduleId,
      role: CONFIG.role,
      wsPath: CONFIG.wsPath,
      autoConnect: true,
      useIndexedDB: true
    });
  } else {
    // Fallback to manual registration
    console.log('[KDS v2] Using manual table registration');
    db = createDB({
      branchId: CONFIG.branchId,
      moduleId: CONFIG.moduleId,
      role: CONFIG.role,
      wsPath: CONFIG.wsPath,
      autoConnect: true,
      useIndexedDB: true,
      objects: {
        order_header: { table: 'order_header' },
        order_line: { table: 'order_line' }
      }
    });
  }

  // ==================== Data Watchers ====================

  // Load reference data from window.database (loaded by pos-mini-db)
  function loadReferenceData() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔍 [DEBUG] Loading reference data from window.database');

    const database = window.database || {};
    console.log('🔍 [DEBUG] window.database:', database);
    console.log('🔍 [DEBUG] window.database keys:', Object.keys(database));

    // Check for kds source
    const kdsSource = database.kds || {};
    const masterSource = (typeof kdsSource.master === 'object' && kdsSource.master) ? kdsSource.master : {};

    console.log('🔍 [DEBUG] kdsSource:', kdsSource);
    console.log('🔍 [DEBUG] masterSource:', masterSource);

    // Load kitchen sections (try multiple paths like original kds.js)
    let sections = [];
    if (Array.isArray(kdsSource.kitchenSections) && kdsSource.kitchenSections.length) {
      sections = kdsSource.kitchenSections;
      console.log('🔍 [DEBUG] Loaded sections from kdsSource.kitchenSections');
    } else if (Array.isArray(masterSource.kitchenSections) && masterSource.kitchenSections.length) {
      sections = masterSource.kitchenSections;
      console.log('🔍 [DEBUG] Loaded sections from masterSource.kitchenSections');
    } else if (Array.isArray(database.kitchen_sections) && database.kitchen_sections.length) {
      sections = database.kitchen_sections;
      console.log('🔍 [DEBUG] Loaded sections from database.kitchen_sections');
    } else if (Array.isArray(database.kitchen_section) && database.kitchen_section.length) {
      sections = database.kitchen_section;
      console.log('🔍 [DEBUG] Loaded sections from database.kitchen_section');
    }

    console.log('🔍 [DEBUG] kitchen_section loaded:', sections.length);
    if (sections.length > 0) {
      console.log('🔍 [DEBUG] First kitchen_section record:', sections[0]);
      console.log('🔍 [DEBUG] kitchen_section fields:', Object.keys(sections[0]));
    }

    state.sections = sections;

    // Load menu items (try multiple paths like original kds.js)
    let items = [];
    if (Array.isArray(masterSource.menu_items) && masterSource.menu_items.length) {
      items = masterSource.menu_items;
      console.log('🔍 [DEBUG] Loaded items from masterSource.menu_items');
    } else if (Array.isArray(database.menu_item) && database.menu_item.length) {
      items = database.menu_item;
      console.log('🔍 [DEBUG] Loaded items from database.menu_item');
    } else if (Array.isArray(database.menu?.items) && database.menu.items.length) {
      items = database.menu.items;
      console.log('🔍 [DEBUG] Loaded items from database.menu.items');
    } else if (Array.isArray(database.menuItems) && database.menuItems.length) {
      items = database.menuItems;
      console.log('🔍 [DEBUG] Loaded items from database.menuItems');
    }

    console.log('🔍 [DEBUG] menu_item loaded:', items.length);
    if (items.length > 0) {
      console.log('🔍 [DEBUG] First menu_item record:', items[0]);
      console.log('🔍 [DEBUG] menu_item fields:', Object.keys(items[0]));
      console.log('🔍 [DEBUG] First 5 menu_items:', items.slice(0, 5));
    }

    state.menuItems = items;

    console.log('═══════════════════════════════════════════════════');

    renderTabs();
    processOrders();
  }

  // Watch for window.database to be loaded
  let referenceDataLoaded = false;

  function tryLoadReferenceData() {
    if (referenceDataLoaded) return false;

    // Check if pos-mini-db has finished loading
    const status = window.__POS_DATA_STATUS__;

    if (!status) {
      console.log('[KDS v2] Waiting for __POS_DATA_STATUS__...');
      return false;
    }

    console.log('[KDS v2] __POS_DATA_STATUS__.status:', status.status);

    if (status.status === 'ready' && window.database && Object.keys(window.database).length > 0) {
      console.log('[KDS v2] window.database is ready, loading reference data...');
      console.log('[KDS v2] window.database keys:', Object.keys(window.database));
      loadReferenceData();
      referenceDataLoaded = true;
      return true;
    } else if (status.status === 'error') {
      console.error('[KDS v2] Failed to load database:', status.error);
      return false;
    }

    return false;
  }

  // Try immediately
  tryLoadReferenceData();

  // If not loaded, keep trying
  if (!referenceDataLoaded) {
    console.log('[KDS v2] Starting interval to wait for database...');
    const checkInterval = setInterval(() => {
      if (tryLoadReferenceData()) {
        clearInterval(checkInterval);
        console.log('[KDS v2] ✅ Reference data loaded successfully!');
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!referenceDataLoaded) {
        clearInterval(checkInterval);
        console.error('[KDS v2] ❌ Timeout waiting for database to load');
        console.error('[KDS v2] __POS_DATA_STATUS__:', window.__POS_DATA_STATUS__);
        console.error('[KDS v2] window.database:', window.database);
      }
    }, 10000);
  }

  // Watch order headers
  db.watch('order_header', (headers) => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔍 [DEBUG] order_header updated:', headers ? headers.length : 0);
    if (headers && headers.length > 0) {
      console.log('🔍 [DEBUG] First order_header record:', headers[0]);
      console.log('🔍 [DEBUG] order_header fields:', Object.keys(headers[0]));
    }
    console.log('═══════════════════════════════════════════════════');

    state.orders = headers || [];
    processOrders();
  });

  // Watch order lines
  db.watch('order_line', (lines) => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔍 [DEBUG] order_line updated:', lines ? lines.length : 0);
    if (lines && lines.length > 0) {
      console.log('🔍 [DEBUG] First order_line record:', lines[0]);
      console.log('🔍 [DEBUG] order_line fields:', Object.keys(lines[0]));
      console.log('🔍 [DEBUG] First 3 order_lines:', lines.slice(0, 3));
    }
    console.log('═══════════════════════════════════════════════════');

    state.lines = lines || [];
    processOrders();
  });

  // Watch connection status
  db.status((status) => {
    console.log('[KDS v2] Connection status:', status);
    state.connected = status === 'connected';
    updateConnectionStatus();
  });

  // ==================== Order Processing ====================
  function processOrders() {
    if (!state.orders || !state.lines) return;

    // Reference data will be loaded by the interval in tryLoadReferenceData()
    // Don't call it here to avoid infinite loop
    if (state.menuItems.length === 0 || state.sections.length === 0) {
      console.log('[KDS v2] Waiting for reference data to load...');
      return;
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('🔍 [DEBUG] processOrders() called');
    console.log('🔍 [DEBUG] state.orders:', state.orders.length);
    console.log('🔍 [DEBUG] state.lines:', state.lines.length);
    console.log('🔍 [DEBUG] state.menuItems:', state.menuItems.length);
    console.log('🔍 [DEBUG] state.sections:', state.sections.length);

    // Clear jobs
    state.jobs.clear();

    // Create index for menu items for fast lookup
    const itemsIndex = {};
    (state.menuItems || []).forEach(item => {
      itemsIndex[item.id] = item;
    });

    console.log('🔍 [DEBUG] itemsIndex created with', Object.keys(itemsIndex).length, 'items');

    // Group lines by orderId and kitchenSectionId
    let firstLineProcessed = false;
    state.lines.forEach((line, index) => {
      const orderId = line.orderId || line.order_id;
      const sectionId = line.kitchenSectionId || line.kitchen_section_id;

      // Debug first line only
      if (!firstLineProcessed && index === 0) {
        console.log('🔍 [DEBUG] Processing first line:', line);
        console.log('🔍 [DEBUG] orderId:', orderId);
        console.log('🔍 [DEBUG] sectionId:', sectionId);
        firstLineProcessed = true;
      }

      if (!orderId || !sectionId) return;

      // Find order header
      const order = state.orders.find(o => o.id === orderId);
      if (!order) return;

      // Get item details from menu_item table
      const itemId = line.itemId || line.item_id;
      const menuItem = itemId ? itemsIndex[itemId] : null;

      // Debug first item lookup
      if (index === 0) {
        console.log('🔍 [DEBUG] itemId:', itemId);
        console.log('🔍 [DEBUG] menuItem found:', menuItem);
      }

      // Use names from menu_item if available, fallback to line data
      const nameAr = menuItem?.nameAr || menuItem?.name_ar || line.itemNameAr || line.item_name_ar || itemId;
      const nameEn = menuItem?.nameEn || menuItem?.name_en || line.itemNameEn || line.item_name_en || itemId;

      if (index === 0) {
        console.log('🔍 [DEBUG] Resolved nameAr:', nameAr);
        console.log('🔍 [DEBUG] Resolved nameEn:', nameEn);
      }

      // Create job ID: orderId:sectionId
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

    // Update job statuses based on items
    state.jobs.forEach(job => {
      if (job.completedItems >= job.totalItems && job.totalItems > 0) {
        job.status = 'ready';
      } else if (job.completedItems > 0) {
        job.status = 'cooking';
      } else {
        job.status = 'queued';
      }
    });

    console.log('🔍 [DEBUG] Total jobs created:', state.jobs.size);
    if (state.jobs.size > 0) {
      const firstJob = Array.from(state.jobs.values())[0];
      console.log('🔍 [DEBUG] First job:', firstJob);
    }
    console.log('═══════════════════════════════════════════════════');

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

  function getJobsForSection(sectionId) {
    return Array.from(state.jobs.values()).filter(job => {
      const jobSectionId = job.sectionId || job.section_id;
      const jobOrderId = job.orderId || job.order_id;
      return jobSectionId === sectionId &&
        job.status !== 'completed' &&
        !state.handoff[jobOrderId];
    });
  }

  function getExpoOrders() {
    // Orders where all kitchen sections are ready
    const orderStatuses = {};
    state.lines.forEach(line => {
      const orderId = line.orderId || line.order_id;
      const statusId = line.statusId || line.status_id || 'queued';

      if (!orderId) return;

      if (!orderStatuses[orderId]) {
        orderStatuses[orderId] = { total: 0, ready: 0 };
      }
      orderStatuses[orderId].total++;
      if (statusId === 'ready') {
        orderStatuses[orderId].ready++;
      }
    });

    const readyOrderIds = Object.keys(orderStatuses).filter(
      orderId => orderStatuses[orderId].ready >= orderStatuses[orderId].total && orderStatuses[orderId].total > 0
    );

    return state.orders.filter(order => {
      const orderId = order.id || order.order_id;
      return readyOrderIds.includes(orderId) && !state.handoff[orderId];
    });
  }

  function getHandoffOrders() {
    // Orders marked as assembled but not served
    return Object.keys(state.handoff)
      .filter(orderId => {
        const record = state.handoff[orderId];
        return record && record.status === 'assembled';
      })
      .map(orderId => state.orders.find(o => (o.id || o.order_id) === orderId))
      .filter(Boolean);
  }

  function getDeliveryOrders() {
    // Orders in delivery with assigned driver
    return Object.keys(state.deliveries.assignments)
      .filter(orderId => !state.deliveries.settlements[orderId])
      .map(orderId => state.orders.find(o => (o.id || o.order_id) === orderId))
      .filter(Boolean);
  }

  function getPendingDeliveryOrders() {
    // Orders awaiting settlement
    return Object.keys(state.deliveries.settlements)
      .map(orderId => state.orders.find(o => (o.id || o.order_id) === orderId))
      .filter(Boolean);
  }

  function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    console.log('═══════════════════════════════════════════════════');
    console.log('🔍 [DEBUG] renderTabs() called');
    console.log('🔍 [DEBUG] state.sections:', state.sections);

    const tabs = [];

    // Add 'prep' tab (all orders view)
    const prepOrders = state.orders.filter(order => !state.handoff[order.id]);
    tabs.push({
      id: 'prep',
      nameAr: MANUAL_STAGES.prep.nameAr,
      nameEn: MANUAL_STAGES.prep.nameEn,
      count: prepOrders.length
    });

    // Add kitchen section tabs (sorted by sequence if available)
    const sortedSections = [...state.sections].sort((a, b) => {
      const seqA = a.sequence || 0;
      const seqB = b.sequence || 0;
      return seqA - seqB;
    });

    console.log('🔍 [DEBUG] sortedSections:', sortedSections);

    sortedSections.forEach(section => {
      const count = getJobsForSection(section.id).length;

      const nameAr = section.nameAr || section.name_ar || section.nameEn || section.name_en || section.id;
      const nameEn = section.nameEn || section.name_en || section.nameAr || section.name_ar || section.id;

      console.log('🔍 [DEBUG] Section:', section.id, '→ nameAr:', nameAr, ', nameEn:', nameEn);

      tabs.push({
        id: section.id,
        nameAr: nameAr,
        nameEn: nameEn,
        count: count
      });
    });

    // Add manual stage tabs
    tabs.push({
      id: 'expo',
      nameAr: MANUAL_STAGES.expo.nameAr,
      nameEn: MANUAL_STAGES.expo.nameEn,
      count: getExpoOrders().length
    });

    tabs.push({
      id: 'handoff',
      nameAr: MANUAL_STAGES.handoff.nameAr,
      nameEn: MANUAL_STAGES.handoff.nameEn,
      count: getHandoffOrders().length
    });

    tabs.push({
      id: 'delivery',
      nameAr: MANUAL_STAGES.delivery.nameAr,
      nameEn: MANUAL_STAGES.delivery.nameEn,
      count: getDeliveryOrders().length
    });

    tabs.push({
      id: 'delivery-pending',
      nameAr: MANUAL_STAGES['delivery-pending'].nameAr,
      nameEn: MANUAL_STAGES['delivery-pending'].nameEn,
      count: getPendingDeliveryOrders().length
    });

    console.log('🔍 [DEBUG] Final tabs array:', tabs);
    console.log('🔍 [DEBUG] Active language:', state.lang);
    console.log('═══════════════════════════════════════════════════');

    container.innerHTML = tabs.map(tab => {
      const displayName = state.lang === 'ar' ? tab.nameAr : tab.nameEn;
      return `
        <button
          class="tab ${state.activeTab === tab.id ? 'active' : ''}"
          onclick="window.switchTab('${tab.id}')"
        >
          ${tab.count > 0 ? `<span class="tab-badge">${tab.count}</span>` : ''}
          ${displayName}
        </button>
      `;
    }).join('');
  }

  function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    // Handle different views based on active tab
    if (state.activeTab === 'expo') {
      return renderExpoView(container);
    }

    if (state.activeTab === 'handoff') {
      return renderHandoffView(container);
    }

    if (state.activeTab === 'delivery') {
      return renderDeliveryView(container);
    }

    if (state.activeTab === 'delivery-pending') {
      return renderPendingDeliveryView(container);
    }

    // Prep or section view: show jobs
    let filteredJobs = Array.from(state.jobs.values());

    if (state.activeTab === 'prep') {
      // Show all jobs not handed off
      filteredJobs = filteredJobs.filter(job => !state.handoff[job.orderId]);
    } else {
      // Show jobs for specific section
      filteredJobs = filteredJobs.filter(job =>
        job.sectionId === state.activeTab &&
        !state.handoff[job.orderId]
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

  function renderExpoView(container) {
    const orders = getExpoOrders();
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <div class="empty-state-text">لا توجد طلبات جاهزة للتجميع</div>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => renderExpoCard(order)).join('');
  }

  function renderHandoffView(container) {
    const orders = getHandoffOrders();
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🧾</div>
          <div class="empty-state-text">لا توجد طلبات جاهزة للتسليم</div>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => renderHandoffCard(order)).join('');
  }

  function renderDeliveryView(container) {
    const orders = getDeliveryOrders();
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🚗</div>
          <div class="empty-state-text">لا توجد طلبات دليفري حالياً</div>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => renderDeliveryCard(order)).join('');
  }

  function renderPendingDeliveryView(container) {
    const orders = getPendingDeliveryOrders();
    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💰</div>
          <div class="empty-state-text">لا توجد معلقات دليفري</div>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(order => renderPendingDeliveryCard(order)).join('');
  }

  function renderOrderCard(job) {
    const timeSince = getTimeSinceCreated(job.createdAt);
    const timeClass = getTimeClass(timeSince);
    const section = state.sections.find(s => s.id === job.sectionId);
    const sectionName = section ? (section.nameAr || section.name_ar || section.nameEn || section.name_en) : job.sectionId;

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

  function getItemName(line, lang = 'ar') {
    // Create items index if not cached
    const itemId = line.itemId || line.item_id;
    const menuItem = state.menuItems.find(item => item.id === itemId);

    if (lang === 'ar') {
      return menuItem?.nameAr || menuItem?.name_ar || line.itemNameAr || line.item_name_ar || itemId || 'صنف';
    } else {
      return menuItem?.nameEn || menuItem?.name_en || line.itemNameEn || line.item_name_en || itemId || 'Item';
    }
  }

  function renderExpoCard(order) {
    const orderId = order.id || order.order_id;
    const lines = state.lines.filter(line => (line.orderId || line.order_id) === orderId);
    const timeSince = getTimeSinceCreated(order.createdAt || order.created_at);
    const timeClass = getTimeClass(timeSince);
    const serviceMode = order.serviceMode || order.service_mode || '';
    const isDelivery = serviceMode === 'delivery';

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.order_number || orderId}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              ${isDelivery ? '🚗 دليفري' : (order.tableLabel || order.table_label || serviceMode || '')}
            </div>
          </div>
          <div class="order-time ${timeClass}">
            ⏱️ ${formatTime(timeSince)}
          </div>
        </div>

        <div class="order-items">
          ${lines.map(line => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${getItemName(line, state.lang)}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          ${isDelivery ? `
            <button class="btn btn-start" onclick="window.assignDriver('${orderId}')">
              🚗 تعيين سائق
            </button>
          ` : `
            <button class="btn btn-ready" onclick="window.assembleOrder('${orderId}')">
              ✅ تم التجميع
            </button>
          `}
        </div>
      </div>
    `;
  }

  function renderHandoffCard(order) {
    const orderId = order.id || order.order_id;
    const lines = state.lines.filter(line => (line.orderId || line.order_id) === orderId);

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.order_number || orderId}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              ${order.tableLabel || order.table_label || order.serviceMode || order.service_mode || ''}
            </div>
          </div>
        </div>

        <div class="order-items">
          ${lines.map(line => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${getItemName(line, state.lang)}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          <button class="btn btn-bump" onclick="window.serveOrder('${orderId}')">
            📦 تم التسليم
          </button>
        </div>
      </div>
    `;
  }

  function renderDeliveryCard(order) {
    const orderId = order.id || order.order_id;
    const lines = state.lines.filter(line => (line.orderId || line.order_id) === orderId);
    const driverName = state.deliveries.assignments[orderId] || 'سائق';

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.order_number || orderId}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              🚗 السائق: ${driverName}
            </div>
          </div>
        </div>

        <div class="order-items">
          ${lines.map(line => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${getItemName(line, state.lang)}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          <button class="btn btn-bump" onclick="window.deliveredOrder('${orderId}')">
            ✅ تم التسليم
          </button>
        </div>
      </div>
    `;
  }

  function renderPendingDeliveryCard(order) {
    const orderId = order.id || order.order_id;
    const lines = state.lines.filter(line => (line.orderId || line.order_id) === orderId);

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.order_number || orderId}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              💰 في انتظار التسوية
            </div>
          </div>
        </div>

        <div class="order-items">
          ${lines.map(line => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${getItemName(line, state.lang)}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          <button class="btn btn-start" onclick="window.settleDelivery('${orderId}')">
            💰 تسوية
          </button>
        </div>
      </div>
    `;
  }

  function renderActionButtons(job) {
    if (job.status === 'queued') {
      return `
        <button class="btn btn-start" onclick="window.startJob('${job.id}')">
          🔥 بدء التجهيز
        </button>
      `;
    }

    if (job.status === 'cooking') {
      return `
        <button class="btn btn-ready" onclick="window.markJobReady('${job.id}')">
          ✅ تم التجهيز
        </button>
      `;
    }

    if (job.status === 'ready') {
      return `
        <button class="btn btn-bump" onclick="window.bumpJob('${job.id}')">
          📦 تم التجميع
        </button>
      `;
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
    console.log('[KDS v2] Starting job:', jobId);
    const job = state.jobs.get(jobId);
    if (!job) return;

    // Update all items in this job to 'cooking' status
    for (const item of job.items) {
      try {
        await db.update('order_line', {
          id: item.id,
          statusId: 'cooking'
        });
      } catch (err) {
        console.error('[KDS v2] Error updating line:', err);
      }
    }
  };

  window.markJobReady = async function(jobId) {
    console.log('[KDS v2] Marking job ready:', jobId);
    const job = state.jobs.get(jobId);
    if (!job) return;

    // Update all items in this job to 'ready' status
    for (const item of job.items) {
      try {
        await db.update('order_line', {
          id: item.id,
          statusId: 'ready'
        });
      } catch (err) {
        console.error('[KDS v2] Error updating line:', err);
      }
    }
  };

  window.bumpJob = async function(jobId) {
    console.log('[KDS v2] Bumping job:', jobId);
    const job = state.jobs.get(jobId);
    if (!job) return;

    // Update all items in this job to 'completed' status
    for (const item of job.items) {
      try {
        await db.update('order_line', {
          id: item.id,
          statusId: 'completed'
        });
      } catch (err) {
        console.error('[KDS v2] Error updating line:', err);
      }
    }
  };

  window.assembleOrder = function(orderId) {
    console.log('[KDS v2] Assembling order:', orderId);
    state.handoff[orderId] = {
      status: 'assembled',
      assembledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    renderTabs();
    renderOrders();
  };

  window.serveOrder = function(orderId) {
    console.log('[KDS v2] Serving order:', orderId);
    state.handoff[orderId] = {
      status: 'served',
      servedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    renderTabs();
    renderOrders();
  };

  window.assignDriver = function(orderId) {
    const driverName = prompt('اسم السائق:');
    if (!driverName) return;

    console.log('[KDS v2] Assigning driver to order:', orderId, driverName);
    state.deliveries.assignments[orderId] = driverName;

    // Also mark as assembled so it moves from expo
    state.handoff[orderId] = {
      status: 'assembled',
      assembledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    renderTabs();
    renderOrders();

    // Auto-switch to delivery tab
    setTimeout(() => {
      window.switchTab('delivery');
    }, 300);
  };

  window.deliveredOrder = function(orderId) {
    console.log('[KDS v2] Delivered order:', orderId);
    state.deliveries.settlements[orderId] = {
      status: 'pending_settlement',
      deliveredAt: new Date().toISOString()
    };
    renderTabs();
    renderOrders();
  };

  window.settleDelivery = function(orderId) {
    console.log('[KDS v2] Settling delivery:', orderId);
    delete state.deliveries.settlements[orderId];
    delete state.deliveries.assignments[orderId];
    renderTabs();
    renderOrders();
  };

  // ==================== Initialize ====================

  console.log('═══════════════════════════════════════════════════');
  console.log('🔍 [DEBUG] Starting database connection...');

  try {
    await db.connect();
    console.log('✅ [KDS v2] Connected to WebSocket successfully');

    // Wait a bit for initial data load
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🔍 [DEBUG] After 2 seconds wait:');
    console.log('🔍 [DEBUG] Reference Data (from window.database):');
    console.log('🔍 [DEBUG] - Sections loaded:', state.sections.length);
    console.log('🔍 [DEBUG] - Menu items loaded:', state.menuItems.length);
    console.log('🔍 [DEBUG] Live Data (from WebSocket):');
    console.log('🔍 [DEBUG] - Orders loaded:', state.orders.length);
    console.log('🔍 [DEBUG] - Lines loaded:', state.lines.length);
    console.log('🔍 [DEBUG] Processing:');
    console.log('🔍 [DEBUG] - Jobs created:', state.jobs.size);
  } catch (err) {
    console.error('❌ [KDS v2] Connection failed:', err);
  }

  console.log('═══════════════════════════════════════════════════');

  // Auto-refresh timer
  setInterval(() => {
    renderOrders();
  }, 1000);

  console.log('✅ [KDS v2] Initialization complete');
})();
