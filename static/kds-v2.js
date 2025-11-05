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
    activeTab: 'all',
    sections: [],
    orders: [],
    jobs: new Map(),
    lang: 'ar'
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

  const db = createDB({
    branchId: CONFIG.branchId,
    moduleId: CONFIG.moduleId,
    role: CONFIG.role,
    wsPath: CONFIG.wsPath,
    autoConnect: true,
    useIndexedDB: true,
    objects: {
      // Register tables we want to watch
      kitchen_section: {
        table: 'kitchen_section'
      },
      order_header: {
        table: 'order_header'
      },
      order_line: {
        table: 'order_line'
      }
    }
  });

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

  function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    const tabs = [
      { id: 'all', nameAr: 'الكل', count: state.jobs.size }
    ];

    // Add section tabs
    state.sections.forEach(section => {
      const count = Array.from(state.jobs.values())
        .filter(job => job.sectionId === section.id && job.status !== 'ready')
        .length;

      tabs.push({
        id: section.id,
        nameAr: section.nameAr || section.nameEn || section.id,
        count: count
      });
    });

    container.innerHTML = tabs.map(tab => `
      <button
        class="tab ${state.activeTab === tab.id ? 'active' : ''}"
        onclick="window.switchTab('${tab.id}')"
      >
        ${tab.count > 0 ? `<span class="tab-badge">${tab.count}</span>` : ''}
        ${tab.nameAr}
      </button>
    `).join('');
  }

  function renderOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    // Filter jobs based on active tab
    let filteredJobs = Array.from(state.jobs.values());

    if (state.activeTab !== 'all') {
      filteredJobs = filteredJobs.filter(job => job.sectionId === state.activeTab);
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
    const sectionName = section ? (section.nameAr || section.nameEn) : job.sectionId;

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
