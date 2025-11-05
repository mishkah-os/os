/**
 * Simple POS Data Loader
 * Loads data directly from REST API bypassing WebSocket store
 * This preserves the original seed data structure without schema transformation
 */

(function(window) {
  'use strict';

  async function loadPosData(branchId, moduleId) {
    const apiUrl = `/api/branches/${branchId}/modules/${moduleId}`;

    try {
      console.log(`[POS Loader] Fetching data from ${apiUrl}`);

      const response = await fetch(apiUrl, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const tables = data.tables || {};

      console.log('[POS Loader] Loaded tables:', Object.keys(tables));
      console.log('[POS Loader] Table counts:', Object.fromEntries(
        Object.entries(tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 'not-array'])
      ));

      // Return original structure - no transformation needed!
      return tables;

    } catch (error) {
      console.error('[POS Loader] Failed to load data:', error);
      throw error;
    }
  }

  // Expose to window
  window.loadPosData = loadPosData;

})(window);
