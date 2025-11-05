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
    sections: [],
    orders: [],
    lines: [],
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

  let db;
  if (posSchema && typeof createDBAuto === 'function') {
    // Use createDBAuto for automatic table registration
    console.log('[KDS v2] Using createDBAuto with schema');
    db = createDBAuto(posSchema, ['kitchen_section', 'order_header', 'order_line'], {
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
        kitchen_section: { table: 'kitchen_section' },
        order_header: { table: 'order_header' },
        order_line: { table: 'order_line' }
      }
    });
  }

  // ==================== Data Watchers ====================

  // Watch kitchen sections
  db.watch('kitchen_section', (sections) => {
    console.log('[KDS v2] kitchen_section updated:', sections.length);
    state.sections = sections || [];
    renderTabs();
    renderOrders();
  });

  // Watch order headers
  db.watch('order_header', (headers) => {
    console.log('[KDS v2] order_header updated:', headers.length);
    state.orders = headers || [];
    processOrders();
  });

  // Watch order lines
  db.watch('order_line', (lines) => {
    console.log('[KDS v2] order_line updated:', lines.length);
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

    // Clear jobs
    state.jobs.clear();

    // Group lines by orderId and kitchenSectionId
    state.lines.forEach(line => {
      const orderId = line.orderId;
      const sectionId = line.kitchenSectionId;

      if (!orderId || !sectionId) return;

      // Find order header
      const order = state.orders.find(o => o.id === orderId);
      if (!order) return;

      // Create job ID: orderId:sectionId
      const jobId = `${orderId}:${sectionId}`;

      // Get or create job
      if (!state.jobs.has(jobId)) {
        state.jobs.set(jobId, {
          id: jobId,
          orderId: orderId,
          orderNumber: order.orderNumber || orderId,
          sectionId: sectionId,
          serviceMode: order.serviceMode || 'dine_in',
          tableLabel: order.tableLabel || '',
          customerName: order.customerName || '',
          status: 'queued',
          createdAt: order.createdAt,
          items: [],
          totalItems: 0,
          completedItems: 0
        });
      }

      const job = state.jobs.get(jobId);

      // Add item to job
      job.items.push({
        id: line.id,
        itemId: line.itemId,
        nameAr: line.itemNameAr || line.itemName || line.itemId,
        nameEn: line.itemNameEn || line.itemName || line.itemId,
        quantity: line.quantity || 1,
        notes: line.notes || '',
        status: line.statusId || 'queued'
      });

      job.totalItems += (line.quantity || 1);
      if (line.statusId === 'ready' || line.statusId === 'completed') {
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
    return Array.from(state.jobs.values()).filter(job =>
      job.sectionId === sectionId &&
      job.status !== 'completed' &&
      !state.handoff[job.orderId]
    );
  }

  function getExpoOrders() {
    // Orders where all kitchen sections are ready
    const orderStatuses = {};
    state.lines.forEach(line => {
      const orderId = line.orderId;
      if (!orderStatuses[orderId]) {
        orderStatuses[orderId] = { total: 0, ready: 0 };
      }
      orderStatuses[orderId].total++;
      if (line.statusId === 'ready') {
        orderStatuses[orderId].ready++;
      }
    });

    const readyOrderIds = Object.keys(orderStatuses).filter(
      orderId => orderStatuses[orderId].ready >= orderStatuses[orderId].total && orderStatuses[orderId].total > 0
    );

    return state.orders.filter(order =>
      readyOrderIds.includes(order.id) &&
      !state.handoff[order.id]
    );
  }

  function getHandoffOrders() {
    // Orders marked as assembled but not served
    return Object.keys(state.handoff)
      .filter(orderId => {
        const record = state.handoff[orderId];
        return record && record.status === 'assembled';
      })
      .map(orderId => state.orders.find(o => o.id === orderId))
      .filter(Boolean);
  }

  function getDeliveryOrders() {
    // Orders in delivery with assigned driver
    return Object.keys(state.deliveries.assignments)
      .filter(orderId => !state.deliveries.settlements[orderId])
      .map(orderId => state.orders.find(o => o.id === orderId))
      .filter(Boolean);
  }

  function getPendingDeliveryOrders() {
    // Orders awaiting settlement
    return Object.keys(state.deliveries.settlements)
      .map(orderId => state.orders.find(o => o.id === orderId))
      .filter(Boolean);
  }

  function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

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

    sortedSections.forEach(section => {
      const count = getJobsForSection(section.id).length;

      tabs.push({
        id: section.id,
        nameAr: section.nameAr || section.name_ar || section.nameEn || section.name_en || section.id,
        nameEn: section.nameEn || section.name_en || section.nameAr || section.name_ar || section.id,
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

  function renderExpoCard(order) {
    const lines = state.lines.filter(line => line.orderId === order.id);
    const timeSince = getTimeSinceCreated(order.createdAt);
    const timeClass = getTimeClass(timeSince);
    const isDelivery = order.serviceMode === 'delivery';

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.id}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              ${isDelivery ? '🚗 دليفري' : (order.tableLabel || order.serviceMode || '')}
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
                  ${line.itemNameAr || line.itemName || line.itemId}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          ${isDelivery ? `
            <button class="btn btn-start" onclick="window.assignDriver('${order.id}')">
              🚗 تعيين سائق
            </button>
          ` : `
            <button class="btn btn-ready" onclick="window.assembleOrder('${order.id}')">
              ✅ تم التجميع
            </button>
          `}
        </div>
      </div>
    `;
  }

  function renderHandoffCard(order) {
    const lines = state.lines.filter(line => line.orderId === order.id);

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.id}</div>
            <div style="font-size: 0.875rem; color: #94a3b8; margin-top: 0.25rem;">
              ${order.tableLabel || order.serviceMode || ''}
            </div>
          </div>
        </div>

        <div class="order-items">
          ${lines.map(line => `
            <div class="order-item">
              <div class="item-header">
                <div class="item-name">
                  ${line.itemNameAr || line.itemName || line.itemId}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          <button class="btn btn-bump" onclick="window.serveOrder('${order.id}')">
            📦 تم التسليم
          </button>
        </div>
      </div>
    `;
  }

  function renderDeliveryCard(order) {
    const lines = state.lines.filter(line => line.orderId === order.id);
    const driverName = state.deliveries.assignments[order.id] || 'سائق';

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.id}</div>
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
                  ${line.itemNameAr || line.itemName || line.itemId}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          <button class="btn btn-bump" onclick="window.deliveredOrder('${order.id}')">
            ✅ تم التسليم
          </button>
        </div>
      </div>
    `;
  }

  function renderPendingDeliveryCard(order) {
    const lines = state.lines.filter(line => line.orderId === order.id);

    return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-number">${order.orderNumber || order.id}</div>
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
                  ${line.itemNameAr || line.itemName || line.itemId}
                </div>
                <div class="item-quantity">× ${line.quantity || 1}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="order-actions">
          <button class="btn btn-start" onclick="window.settleDelivery('${order.id}')">
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

  try {
    await db.connect();
    console.log('[KDS v2] Connected to database');
  } catch (err) {
    console.error('[KDS v2] Connection failed:', err);
  }

  // Auto-refresh timer
  setInterval(() => {
    renderOrders();
  }, 1000);

  console.log('[KDS v2] Initialization complete');
})();
