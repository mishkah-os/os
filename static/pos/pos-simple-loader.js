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
      const response = await fetch(apiUrl, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const tables = data.tables || {};

      // Map singular table names to plural for backward compatibility with pos.js
      const mappedTables = { ...tables };

      // Critical mappings for pos.js
      if (tables.menu_item && !mappedTables.menu_items) {
        mappedTables.menu_items = tables.menu_item;
      }

      if (tables.menu_category && !mappedTables.menu_categories) {
        mappedTables.menu_categories = tables.menu_category;
      }

      if (tables.category_section && !mappedTables.category_sections) {
        mappedTables.category_sections = tables.category_section;
      }

      if (tables.kitchen_section && !mappedTables.kitchen_sections) {
        mappedTables.kitchen_sections = tables.kitchen_section;
      }

      if (tables.payment_method && !mappedTables.payment_methods) {
        mappedTables.payment_methods = tables.payment_method;
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
      }

      return mappedTables;

    } catch (error) {
      throw error;
    }
  }

  // Expose to window
  window.loadPosData = loadPosData;

})(window);
