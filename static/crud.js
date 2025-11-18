/**
 * Mishkah Dynamic CRUD UI Logic
 * Full dynamic testing interface for schema-driven CRUD
 */

(function() {
  'use strict';

  // ==================== STATE ====================

  let crud = null;
  let store = null;
  let currentTable = null;
  let currentData = null;
  let isDirty = false;
  let availableBranches = [];
  let availableModules = [];

  // ==================== HELPERS ====================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  function showLoading() {
    const content = document.getElementById('contentArea');
    content.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p style="margin-top: 16px;">جاري التحميل...</p>
      </div>
    `;
  }

  function showError(error) {
    const content = document.getElementById('contentArea');
    content.innerHTML = `
      <div class="empty-state">
        <h3 style="color: #ef4444;">❌ خطأ</h3>
        <p>${error.message || error}</p>
      </div>
    `;
  }

  // ==================== CONNECTION ====================

  async function connect() {
    const branchId = document.getElementById('branchId').value.trim();
    const moduleId = document.getElementById('moduleId').value.trim();
    const btn = document.getElementById('connectBtn');
    const status = document.getElementById('statusIndicator');

    if (!branchId || !moduleId) {
      showToast('يرجى إدخال Branch ID و Module ID', 'error');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = '⏳ جاري الاتصال...';
      status.className = 'status disconnected';

      // Create CRUD instance
      crud = window.createCRUD({ branchId, moduleId });

      // Connect to store
      store = await crud.connect();

      // Update UI
      btn.textContent = '✅ متصل';
      btn.disabled = false;
      status.className = 'status connected';
      status.innerHTML = '<span class="status-dot"></span><span>متصل</span>';

      showToast(`تم الاتصال بنجاح: ${branchId}/${moduleId}`, 'success');

      // Load tables list
      await loadTablesList();

    } catch (error) {
      console.error('Connection error:', error);
      btn.textContent = '🔌 اتصال';
      btn.disabled = false;
      status.className = 'status disconnected';
      status.innerHTML = '<span class="status-dot"></span><span>غير متصل</span>';
      showToast(`فشل الاتصال: ${error.message}`, 'error');
    }
  }

  // ==================== TABLES LIST ====================

  async function loadTablesList() {
    const list = document.getElementById('tablesList');
    list.innerHTML = '<li class="table-item">⏳ جاري التحميل...</li>';

    try {
      // Wait for store to be ready
      await store.ready();

      // Get tables from store snapshot
      const snapshot = store.snapshot();

      if (!snapshot || !snapshot.tables) {
        list.innerHTML = '<li style="padding: 10px; color: #6b7280; font-size: 13px;">لا توجد بيانات بعد</li>';
        return;
      }

      const tables = Object.keys(snapshot.tables || {});

      if (tables.length === 0) {
        list.innerHTML = '<li style="padding: 10px; color: #6b7280; font-size: 13px;">لا توجد جداول</li>';
        return;
      }

      // Render tables
      list.innerHTML = '';
      tables.forEach(tableName => {
        const li = document.createElement('li');
        li.className = 'table-item';
        li.textContent = tableName;
        li.onclick = () => loadTable(tableName);
        list.appendChild(li);
      });

    } catch (error) {
      console.error('Failed to load tables:', error);
      list.innerHTML = '<li style="padding: 10px; color: #ef4444; font-size: 13px;">فشل التحميل</li>';
    }
  }

  // ==================== LOAD TABLE ====================

  async function loadTable(tableName) {
    if (!crud || !store) {
      showToast('غير متصل بالخادم', 'error');
      return;
    }

    // Check if dirty
    if (isDirty) {
      if (!confirm('هناك تغييرات غير محفوظة. هل تريد المتابعة؟')) {
        return;
      }
      isDirty = false;
    }

    currentTable = tableName;

    // Update active state
    document.querySelectorAll('.table-item').forEach(item => {
      item.classList.toggle('active', item.textContent === tableName);
    });

    showLoading();

    try {
      // Get data
      const result = await crud.getData(tableName, {
        top: 100,
        page: 1,
        populate: true
      });

      currentData = result;
      isDirty = false;

      // Render table
      renderTable(result);

    } catch (error) {
      console.error('Failed to load table:', error);
      showError(error);
      showToast(`فشل تحميل الجدول: ${error.message}`, 'error');
    }
  }

  // ==================== RENDER TABLE ====================

  function renderTable(data) {
    const content = document.getElementById('contentArea');

    if (!data || !data.data || data.data.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <h3>${data.name}</h3>
          <p>لا توجد بيانات</p>
        </div>
      `;
      return;
    }

    // Build table HTML
    const columns = data.columns || [];
    const records = data.data || [];

    let html = `
      <div class="toolbar">
        <h2>📊 ${data.name}</h2>
        <div class="actions">
          <button class="btn" onclick="reloadTable()">🔄 تحديث</button>
          <button class="btn" onclick="saveSeeds()" style="background: #f59e0b; color: white; border-color: #f59e0b;">🌱 حفظ البذور</button>
          <button class="btn btn-primary" onclick="addRow()">➕ إضافة صف</button>
          <button class="btn btn-success" onclick="saveChanges()" ${!isDirty ? 'disabled' : ''}>💾 حفظ التغييرات</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
    `;

    // Column headers
    columns.forEach(col => {
      html += `<th>${col.trans_name || col.name}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Data rows
    records.forEach((record, rowIndex) => {
      html += '<tr>';

      columns.forEach(col => {
        const value = record[col.name];
        const cellId = `cell-${rowIndex}-${col.name}`;

        html += '<td>';

        // Read-only ID fields (primary keys)
        if (col.name.toLowerCase() === 'id' || col.primaryKey) {
          html += `
            <input type="text"
              id="${cellId}"
              value="${escapeHtml(String(value || ''))}"
              readonly
              style="background: #f3f4f6; cursor: not-allowed; font-family: monospace; font-size: 12px;">
          `;
        }
        // Foreign Key fields
        else if (col.isreferences) {
          const fkValue = typeof value === 'object' && value !== null ? value.value || value.id : value;
          const fkId = typeof value === 'object' && value !== null ? value.id : value;

          html += `
            <div class="fk-field">
              <input type="text"
                class="fk-value"
                id="${cellId}"
                value="${escapeHtml(fkValue || '')}"
                onchange="markDirty(${rowIndex}, '${col.name}', this.value, true)"
                placeholder="${col.trans_name || col.name}"
                style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;">
              <span class="fk-badge" style="padding: 4px 10px; background: #dbeafe; color: #1e40af; border-radius: 6px; font-size: 11px; font-weight: 600;">${escapeHtml(String(fkId || ''))}</span>
            </div>
          `;
        }
        // Date fields
        else if (col.type.toLowerCase().includes('date') && !col.type.toLowerCase().includes('time')) {
          const dateValue = value ? new Date(value).toISOString().slice(0, 10) : '';
          html += `
            <input type="date"
              id="${cellId}"
              value="${dateValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }
        // DateTime fields
        else if (col.type.toLowerCase().includes('datetime') || col.type.toLowerCase().includes('timestamp')) {
          const dateValue = value ? new Date(value).toISOString().slice(0, 16) : '';
          html += `
            <input type="datetime-local"
              id="${cellId}"
              value="${dateValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }
        // Time fields
        else if (col.type.toLowerCase().includes('time')) {
          const timeValue = value || '';
          html += `
            <input type="time"
              id="${cellId}"
              value="${timeValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }
        // Boolean/Checkbox fields
        else if (col.type.toLowerCase().includes('bool') || col.type.toLowerCase().includes('bit')) {
          const checked = value === 1 || value === true || value === 'true' || value === '1';
          html += `
            <label style="display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <input type="checkbox"
                id="${cellId}"
                ${checked ? 'checked' : ''}
                onchange="markDirty(${rowIndex}, '${col.name}', this.checked ? 1 : 0)"
                style="width: 20px; height: 20px; cursor: pointer;">
            </label>
          `;
        }
        // Integer/Number fields
        else if (col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('integer')) {
          html += `
            <input type="number"
              id="${cellId}"
              value="${value || 0}"
              step="1"
              onchange="markDirty(${rowIndex}, '${col.name}', parseInt(this.value) || 0)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%; text-align: right;">
          `;
        }
        // Decimal/Float fields
        else if (col.type.toLowerCase().includes('decimal') || col.type.toLowerCase().includes('float') || col.type.toLowerCase().includes('double')) {
          html += `
            <input type="number"
              id="${cellId}"
              value="${value || 0}"
              step="0.01"
              onchange="markDirty(${rowIndex}, '${col.name}', parseFloat(this.value) || 0)"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%; text-align: right;">
          `;
        }
        // Long text fields (description, notes, etc.)
        else if (
          col.name.toLowerCase().includes('description') ||
          col.name.toLowerCase().includes('notes') ||
          col.name.toLowerCase().includes('comment') ||
          col.name.toLowerCase().includes('details') ||
          (typeof value === 'string' && value.length > 100)
        ) {
          html += `
            <textarea
              id="${cellId}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              rows="2"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%; resize: vertical; font-family: inherit;">${escapeHtml(String(value || ''))}</textarea>
          `;
        }
        // Regular text fields
        else {
          html += `
            <input type="text"
              id="${cellId}"
              value="${escapeHtml(String(value || ''))}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)"
              placeholder="${col.trans_name || col.name}"
              style="padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; width: 100%;">
          `;
        }

        html += '</td>';
      });

      html += '</tr>';
    });

    html += `
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button onclick="prevPage()" disabled>السابق</button>
        <span>صفحة ${data.page || 1} - إجمالي: ${data.count || 0} سجل</span>
        <button onclick="nextPage()" disabled>التالي</button>
      </div>
    `;

    content.innerHTML = html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== EDIT HANDLING ====================

  window.markDirty = function(rowIndex, fieldName, value, isFk = false) {
    if (!currentData || !currentData.data[rowIndex]) return;

    const record = currentData.data[rowIndex];

    if (isFk) {
      // FK field: update value but keep id
      if (typeof record[fieldName] === 'object' && record[fieldName] !== null) {
        record[fieldName].value = value;
      } else {
        record[fieldName] = { value, id: value };
      }
    } else {
      record[fieldName] = value;
    }

    isDirty = true;

    // Enable save button
    const saveBtn = document.querySelector('.btn-success');
    if (saveBtn) saveBtn.disabled = false;
  };

  // ==================== ACTIONS ====================

  window.reloadTable = async function() {
    if (currentTable) {
      await loadTable(currentTable);
    }
  };

  window.addRow = function() {
    if (!currentData || !currentData.columns) {
      showToast('لا يمكن إضافة صف', 'error');
      return;
    }

    // Create empty row based on columns
    const newRow = {};
    currentData.columns.forEach(col => {
      if (col.name.toLowerCase() === 'id') {
        newRow[col.name] = `new-${Date.now()}`;
      } else if (col.isreferences) {
        newRow[col.name] = { value: '', id: '' };
      } else if (col.type.includes('int') || col.type.includes('decimal')) {
        newRow[col.name] = 0;
      } else if (col.type.includes('datetime')) {
        newRow[col.name] = new Date().toISOString();
      } else {
        newRow[col.name] = '';
      }
    });

    currentData.data.push(newRow);
    isDirty = true;

    renderTable(currentData);
    showToast('تم إضافة صف جديد', 'success');
  };

  window.saveChanges = async function() {
    if (!crud || !currentData || !isDirty) {
      return;
    }

    try {
      showToast('جاري الحفظ...', 'info');

      const result = await crud.save(currentTable, currentData);

      if (result.success) {
        showToast(`تم الحفظ بنجاح: ${result.saved} سجل`, 'success');
        isDirty = false;
        await reloadTable();
      } else {
        showToast(`تم الحفظ جزئياً: ${result.saved} نجح، ${result.errors} فشل`, 'error');
        console.error('Save errors:', result.errorDetails);
      }

    } catch (error) {
      console.error('Save error:', error);
      showToast(`فشل الحفظ: ${error.message}`, 'error');
    }
  };

  window.prevPage = function() {
    // TODO: Implement pagination
    showToast('قيد التطوير', 'info');
  };

  window.nextPage = function() {
    // TODO: Implement pagination
    showToast('قيد التطوير', 'info');
  };

  // ==================== BRANCHES & MODULES ====================

  async function loadBranches() {
    try {
      const response = await fetch('/api/branches');
      const data = await response.json();

      if (data.branches) {
        availableBranches = data.branches;
        const select = document.getElementById('branchId');
        select.innerHTML = '<option value="">-- اختر الفرع --</option>';

        data.branches.forEach(branch => {
          const option = document.createElement('option');
          option.value = branch;
          option.textContent = branch;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
      showToast('فشل تحميل الفروع', 'error');
    }
  }

  async function loadModules(branchId) {
    if (!branchId) {
      document.getElementById('moduleId').innerHTML = '<option value="">-- اختر الموديول --</option>';
      document.getElementById('connectBtn').disabled = true;
      return;
    }

    try {
      const response = await fetch(`/api/branches/${branchId}/modules`);
      const data = await response.json();

      if (data.modules) {
        availableModules = data.modules;
        const select = document.getElementById('moduleId');
        select.innerHTML = '<option value="">-- اختر الموديول --</option>';

        data.modules.forEach(module => {
          const option = document.createElement('option');
          option.value = module;
          option.textContent = module;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to load modules:', error);
      showToast('فشل تحميل الموديولات', 'error');
    }
  }

  // ==================== SAVE SEEDS ====================

  window.saveSeeds = async function() {
    if (!crud || !store) {
      showToast('غير متصل بالخادم', 'error');
      return;
    }

    // Show table selection dialog
    const snapshot = store.snapshot();
    if (!snapshot || !snapshot.tables) {
      showToast('لا توجد بيانات لحفظها', 'error');
      return;
    }

    const tables = Object.keys(snapshot.tables || {});
    if (tables.length === 0) {
      showToast('لا توجد جداول', 'error');
      return;
    }

    // Create dialog for table selection
    const selectedTables = await showTableSelectionDialog(tables);

    if (!selectedTables || selectedTables.length === 0) {
      return;
    }

    try {
      showToast('جاري حفظ البذور...', 'info');

      const seeds = {};

      for (const tableName of selectedTables) {
        const tableData = snapshot.tables[tableName];
        if (tableData) {
          seeds[tableName] = Object.values(tableData);
        }
      }

      const branchId = document.getElementById('branchId').value;
      const moduleId = document.getElementById('moduleId').value;

      const response = await fetch('/api/seeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          branchId,
          moduleId,
          seeds
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast(`✅ تم حفظ البذور: ${result.recordCount} سجل من ${result.tables.length} جدول`, 'success');
      } else {
        showToast('فشل حفظ البذور', 'error');
      }

    } catch (error) {
      console.error('Save seeds error:', error);
      showToast(`فشل حفظ البذور: ${error.message}`, 'error');
    }
  };

  async function showTableSelectionDialog(tables) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 16px; color: #111827; font-size: 18px;">اختر الجداول لحفظ البذور</h3>
        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px; background: #f9fafb; margin-bottom: 8px;">
            <input type="checkbox" id="selectAll" style="width: 18px; height: 18px;">
            <span style="font-weight: 600;">تحديد الكل</span>
          </label>
        </div>
        <div id="tableList" style="margin-bottom: 20px; max-height: 400px; overflow-y: auto;"></div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancelBtn" style="padding: 10px 20px; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; font-weight: 500;">إلغاء</button>
          <button id="confirmBtn" style="padding: 10px 20px; border: none; border-radius: 6px; background: #667eea; color: white; cursor: pointer; font-weight: 500;">حفظ البذور</button>
        </div>
      `;

      const tableList = dialog.querySelector('#tableList');
      tables.forEach(tableName => {
        const label = document.createElement('label');
        label.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.2s;
        `;
        label.onmouseover = () => label.style.background = '#f3f4f6';
        label.onmouseout = () => label.style.background = 'transparent';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = tableName;
        checkbox.className = 'table-checkbox';
        checkbox.style.cssText = 'width: 16px; height: 16px;';

        const span = document.createElement('span');
        span.textContent = tableName;
        span.style.fontSize = '14px';

        label.appendChild(checkbox);
        label.appendChild(span);
        tableList.appendChild(label);
      });

      // Select all functionality
      const selectAll = dialog.querySelector('#selectAll');
      selectAll.onchange = () => {
        const checkboxes = dialog.querySelectorAll('.table-checkbox');
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
      };

      dialog.querySelector('#cancelBtn').onclick = () => {
        overlay.remove();
        resolve(null);
      };

      dialog.querySelector('#confirmBtn').onclick = () => {
        const checkboxes = dialog.querySelectorAll('.table-checkbox:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        overlay.remove();
        resolve(selected);
      };

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      };
    });
  }

  // ==================== INIT ====================

  document.addEventListener('DOMContentLoaded', () => {
    // Load branches on init
    loadBranches();

    // Branch selection handler
    document.getElementById('branchId').onchange = (e) => {
      loadModules(e.target.value);
    };

    // Module selection handler
    document.getElementById('moduleId').onchange = (e) => {
      const branchId = document.getElementById('branchId').value;
      const moduleId = e.target.value;

      if (branchId && moduleId) {
        document.getElementById('connectBtn').disabled = false;
      } else {
        document.getElementById('connectBtn').disabled = true;
      }
    };

    document.getElementById('connectBtn').onclick = connect;

    // Check if already connected via query params
    const params = new URLSearchParams(window.location.search);
    const autoConnect = params.get('autoConnect');

    if (autoConnect === 'true') {
      setTimeout(connect, 500);
    }
  });

})();
