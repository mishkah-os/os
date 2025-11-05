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

      // Map singular table names to plural for backward compatibility with pos.js
      const mappedTables = { ...tables };

      // Critical mappings for pos.js
      if (tables.menu_item && !mappedTables.menu_items) {
        mappedTables.menu_items = tables.menu_item;
        console.log('[POS Loader] Mapped menu_item → menu_items');
      }

      if (tables.menu_category && !mappedTables.menu_categories) {
        mappedTables.menu_categories = tables.menu_category;
        console.log('[POS Loader] Mapped menu_category → menu_categories');
      }

      if (tables.category_section && !mappedTables.category_sections) {
        mappedTables.category_sections = tables.category_section;
        console.log('[POS Loader] Mapped category_section → category_sections');
      }

      if (tables.kitchen_section && !mappedTables.kitchen_sections) {
        mappedTables.kitchen_sections = tables.kitchen_section;
        console.log('[POS Loader] Mapped kitchen_section → kitchen_sections');
      }

      if (tables.payment_method && !mappedTables.payment_methods) {
        mappedTables.payment_methods = tables.payment_method;
        console.log('[POS Loader] Mapped payment_method → payment_methods');
      }

      if (tables.order_type && !mappedTables.order_types) {
        mappedTables.order_types = tables.order_type;
      }

      if (tables.order_status && !mappedTables.order_statuses) {
        mappedTables.order_statuses = tables.order_status;
      }

      if (tables.order_stage && !mappedTables.order_stages) {
        mappedTables.order_stages = tables.order_stage;
      }

      if (tables.order_payment_state && !mappedTables.order_payment_states) {
        mappedTables.order_payment_states = tables.order_payment_state;
      }

      if (tables.order_line_status && !mappedTables.order_line_statuses) {
        mappedTables.order_line_statuses = tables.order_line_status;
      }

      if (tables.employee && !mappedTables.employees) {
        mappedTables.employees = tables.employee;
      }

      if (tables.delivery_driver && !mappedTables.delivery_drivers) {
        mappedTables.delivery_drivers = tables.delivery_driver;
      }

      // Handle menu_modifier → modifiers object
      if (tables.menu_modifier && Array.isArray(tables.menu_modifier) && !mappedTables.modifiers) {
        const add_ons = [];
        const removals = [];

        tables.menu_modifier.forEach(mod => {
          if (mod.modifierType === 'add_on' || mod.modifierType === 'addon') {
            add_ons.push(mod);
          } else if (mod.modifierType === 'removal' || mod.modifierType === 'remove') {
            removals.push(mod);
          }
        });

        mappedTables.modifiers = { add_ons, removals };
        console.log('[POS Loader] Mapped menu_modifier → modifiers:', { add_ons: add_ons.length, removals: removals.length });
      }

      console.log('[POS Loader] Final tables:', Object.keys(mappedTables).filter(k => {
        const v = mappedTables[k];
        return Array.isArray(v) ? v.length > 0 : (typeof v === 'object' && Object.keys(v).length > 0);
      }));

      return mappedTables;

    } catch (error) {
      console.error('[POS Loader] Failed to load data:', error);
      throw error;
    }
  }

  // Expose to window
  window.loadPosData = loadPosData;

})(window);
