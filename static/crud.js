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

        if (col.isreferences) {
          // FK field with {value, id} structure
          const fkValue = typeof value === 'object' && value !== null ? value.value || value.id : value;
          const fkId = typeof value === 'object' && value !== null ? value.id : value;

          html += `
            <div class="fk-field">
              <input type="text"
                class="fk-value"
                id="${cellId}"
                value="${escapeHtml(fkValue || '')}"
                onchange="markDirty(${rowIndex}, '${col.name}', this.value, true)"
                placeholder="${col.trans_name}">
              <span class="fk-badge">${escapeHtml(String(fkId || ''))}</span>
            </div>
          `;
        } else if (col.type.includes('datetime')) {
          // DateTime field
          const dateValue = value ? new Date(value).toISOString().slice(0, 16) : '';
          html += `
            <input type="datetime-local"
              id="${cellId}"
              value="${dateValue}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)">
          `;
        } else if (col.type.includes('int') || col.type.includes('decimal')) {
          // Number field
          html += `
            <input type="number"
              id="${cellId}"
              value="${value || 0}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)">
          `;
        } else {
          // Text field
          html += `
            <input type="text"
              id="${cellId}"
              value="${escapeHtml(String(value || ''))}"
              onchange="markDirty(${rowIndex}, '${col.name}', this.value)">
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

  // ==================== INIT ====================

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('connectBtn').onclick = connect;

    // Check if already connected via query params
    const params = new URLSearchParams(window.location.search);
    const autoConnect = params.get('autoConnect');

    if (autoConnect === 'true') {
      setTimeout(connect, 500);
    }
  });

})();
