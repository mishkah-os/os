(function(global){
  const MishkahPOSSchema = {
    name: 'mishkah_pos',
    version: 1,
    tables: [
      {
        name: 'pos_terminal',
        label: 'POS Terminal',
        sqlName: 'pos_terminal',
        comment: 'Registered POS terminals with physical location metadata.',
        layout: { x: 80, y: 40 },
        fields: [
          { name: 'id', columnName: 'terminal_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'code', columnName: 'terminal_code', type: 'string', nullable: false, unique: true, maxLength: 32 },
          { name: 'label', columnName: 'terminal_label', type: 'string', nullable: false, maxLength: 96 },
          { name: 'number', columnName: 'terminal_number', type: 'integer', nullable: false },
          { name: 'locationId', columnName: 'location_id', type: 'string', nullable: true, maxLength: 64 },
          { name: 'zone', columnName: 'zone', type: 'string', nullable: true, maxLength: 32 },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'active' },
          { name: 'timezone', columnName: 'timezone', type: 'string', nullable: true, maxLength: 64 },
          { name: 'lastOnlineAt', columnName: 'last_online_at', type: 'timestamp', nullable: true },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_pos_terminal_code', columns: ['terminal_code'], unique: true },
          { name: 'idx_pos_terminal_status', columns: ['status'] }
        ]
      },
      {
        name: 'employee',
        label: 'Employee',
        sqlName: 'employee',
        comment: 'Employees and roles that can access the POS.',
        layout: { x: 200, y: 40 },
        fields: [
          { name: 'id', columnName: 'employee_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'fullName', columnName: 'full_name', type: 'string', nullable: false, maxLength: 128 },
          { name: 'role', columnName: 'role', type: 'string', nullable: false, defaultValue: 'staff' },
          { name: 'pinCode', columnName: 'pin_code', type: 'string', nullable: false, maxLength: 16 },
          { name: 'allowedDiscountRate', columnName: 'allowed_discount_rate', type: 'decimal', precision: 5, scale: 4, nullable: false, defaultValue: 0 },
          { name: 'phone', columnName: 'phone', type: 'string', nullable: true, maxLength: 32 },
          { name: 'email', columnName: 'email', type: 'string', nullable: true, maxLength: 96 },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'active' },
          { name: 'hiredAt', columnName: 'hired_at', type: 'timestamp', nullable: true },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_employee_role', columns: ['role'] },
          { name: 'idx_employee_status', columns: ['status'] }
        ]
      },
      {
        name: 'pos_shift',
        label: 'POS Shift',
        sqlName: 'pos_shift',
        comment: 'Lifecycle of a cashier shift per terminal.',
        layout: { x: 320, y: 60 },
        fields: [
          { name: 'id', columnName: 'shift_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'posId', columnName: 'pos_id', type: 'string', nullable: false, references: { table: 'pos_terminal', column: 'terminal_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'posLabel', columnName: 'pos_label', type: 'string', nullable: false, maxLength: 96 },
          { name: 'posNumber', columnName: 'pos_number', type: 'integer', nullable: false },
          { name: 'openedAt', columnName: 'opened_at', type: 'timestamp', nullable: false },
          { name: 'closedAt', columnName: 'closed_at', type: 'timestamp', nullable: true },
          { name: 'openingFloat', columnName: 'opening_float', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'closingCash', columnName: 'closing_cash', type: 'decimal', precision: 12, scale: 2, nullable: true },
          { name: 'cashierId', columnName: 'cashier_id', type: 'string', nullable: false, references: { table: 'employee', column: 'employee_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'cashierName', columnName: 'cashier_name', type: 'string', nullable: false, maxLength: 128 },
          { name: 'cashierRole', columnName: 'cashier_role', type: 'string', nullable: false, defaultValue: 'cashier' },
          { name: 'employeeId', columnName: 'employee_id', type: 'string', nullable: false, references: { table: 'employee', column: 'employee_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'open' },
          { name: 'isClosed', columnName: 'is_closed', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'totalsByType', columnName: 'totals_by_type', type: 'json', nullable: false, defaultValue: {} },
          { name: 'paymentsByMethod', columnName: 'payments_by_method', type: 'json', nullable: false, defaultValue: {} },
          { name: 'countsByType', columnName: 'counts_by_type', type: 'json', nullable: false, defaultValue: {} },
          { name: 'ordersCount', columnName: 'orders_count', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'orders', columnName: 'orders_payload', type: 'json', nullable: false, defaultValue: [] },
          { name: 'totalSales', columnName: 'total_sales', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_pos_shift_pos_status', columns: ['pos_id', 'is_closed', 'opened_at'] },
          { name: 'idx_pos_shift_opened_at', columns: ['opened_at'] }
        ]
      },
      {
        name: 'shift_cash_audit',
        label: 'Shift Cash Audit',
        sqlName: 'shift_cash_audit',
        comment: 'Cash denomination counts captured when closing a shift.',
        layout: { x: 560, y: 40 },
        fields: [
          { name: 'id', columnName: 'audit_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'shiftId', columnName: 'shift_id', type: 'string', nullable: false, references: { table: 'pos_shift', column: 'shift_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'denomination', columnName: 'denomination', type: 'decimal', precision: 8, scale: 2, nullable: false },
          { name: 'count', columnName: 'count', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'amount', columnName: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: false },
          { name: 'capturedAt', columnName: 'captured_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_shift_cash_audit_shift', columns: ['shift_id'] }
        ]
      },
      {
        name: 'shift_payment_summary',
        label: 'Shift Payment Summary',
        sqlName: 'shift_payment_summary',
        comment: 'Aggregated totals per payment method for a shift.',
        layout: { x: 560, y: 140 },
        fields: [
          { name: 'id', columnName: 'summary_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'shiftId', columnName: 'shift_id', type: 'string', nullable: false, references: { table: 'pos_shift', column: 'shift_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'paymentMethodId', columnName: 'payment_method_id', type: 'string', nullable: false, references: { table: 'payment_method', column: 'payment_method_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'paymentsCount', columnName: 'payments_count', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'totalAmount', columnName: 'total_amount', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 }
        ],
        indexes: [
          { name: 'idx_shift_payment_summary_shift', columns: ['shift_id'] }
        ]
      },
      {
        name: 'order_type',
        label: 'Order Type',
        sqlName: 'order_type',
        comment: 'Supported POS order types and workflows.',
        layout: { x: 80, y: 160 },
        fields: [
          { name: 'id', columnName: 'order_type_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'workflow', columnName: 'workflow', type: 'string', nullable: false, defaultValue: 'single-step' },
          { name: 'allowsSave', columnName: 'allows_save', type: 'boolean', nullable: false, defaultValue: true },
          { name: 'allowsFinalizeLater', columnName: 'allows_finalize_later', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'allowsLineAdditions', columnName: 'allows_line_additions', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'allowsReturns', columnName: 'allows_returns', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'sequence', columnName: 'sequence', type: 'integer', nullable: false, defaultValue: 0 }
        ],
        indexes: [
          { name: 'idx_order_type_sequence', columns: ['sequence'] }
        ]
      },
      {
        name: 'order_status',
        label: 'Order Status',
        sqlName: 'order_status',
        comment: 'High level status codes for orders.',
        layout: { x: 200, y: 160 },
        fields: [
          { name: 'id', columnName: 'status_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'sequence', columnName: 'sequence', type: 'integer', nullable: false, defaultValue: 0 }
        ]
      },
      {
        name: 'order_stage',
        label: 'Order Fulfilment Stage',
        sqlName: 'order_stage',
        comment: 'Lifecycle stages for kitchen and delivery workflows.',
        layout: { x: 320, y: 160 },
        fields: [
          { name: 'id', columnName: 'stage_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'descriptionAr', columnName: 'description_ar', type: 'text', nullable: true },
          { name: 'descriptionEn', columnName: 'description_en', type: 'text', nullable: true },
          { name: 'sequence', columnName: 'sequence', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'lockLineEdits', columnName: 'lock_line_edits', type: 'boolean', nullable: false, defaultValue: false }
        ],
        indexes: [
          { name: 'idx_order_stage_sequence', columns: ['sequence'] }
        ]
      },
      {
        name: 'order_payment_state',
        label: 'Order Payment State',
        sqlName: 'order_payment_state',
        comment: 'Possible payment states for orders.',
        layout: { x: 440, y: 160 },
        fields: [
          { name: 'id', columnName: 'payment_state_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 }
        ]
      },
      {
        name: 'order_line_status',
        label: 'Order Line Status',
        sqlName: 'order_line_status',
        comment: 'State machine for individual order lines.',
        layout: { x: 560, y: 160 },
        fields: [
          { name: 'id', columnName: 'line_status_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'sequence', columnName: 'sequence', type: 'integer', nullable: false, defaultValue: 0 }
        ]
      },
      {
        name: 'payment_method',
        label: 'Payment Method',
        sqlName: 'payment_method',
        comment: 'Configured payment methods offered by the venue.',
        layout: { x: 680, y: 160 },
        fields: [
          { name: 'id', columnName: 'payment_method_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'type', columnName: 'method_type', type: 'string', nullable: false, defaultValue: 'cash' },
          { name: 'icon', columnName: 'icon', type: 'string', nullable: true, maxLength: 32 },
          { name: 'requiresReference', columnName: 'requires_reference', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'isActive', columnName: 'is_active', type: 'boolean', nullable: false, defaultValue: true }
        ]
      },
      {
        name: 'kitchen_section',
        label: 'Kitchen Section',
        sqlName: 'kitchen_section',
        comment: 'Production areas used for routing kitchen tickets.',
        layout: { x: 800, y: 60 },
        fields: [
          { name: 'id', columnName: 'section_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'descriptionAr', columnName: 'description_ar', type: 'text', nullable: true },
          { name: 'descriptionEn', columnName: 'description_en', type: 'text', nullable: true },
          { name: 'sortOrder', columnName: 'sort_order', type: 'integer', nullable: false, defaultValue: 0 }
        ]
      },
      {
        name: 'menu_category',
        label: 'Menu Category',
        sqlName: 'menu_category',
        comment: 'Menu taxonomy categories.',
        layout: { x: 800, y: 160 },
        fields: [
          { name: 'id', columnName: 'category_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 64 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 64 },
          { name: 'sectionId', columnName: 'section_id', type: 'string', nullable: true, references: { table: 'kitchen_section', column: 'section_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'sortOrder', columnName: 'sort_order', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'isActive', columnName: 'is_active', type: 'boolean', nullable: false, defaultValue: true }
        ]
      },
      {
        name: 'category_section',
        label: 'Category Section Map',
        sqlName: 'category_section',
        comment: 'Bridge between menu categories and kitchen sections.',
        layout: { x: 920, y: 160 },
        fields: [
          { name: 'categoryId', columnName: 'category_id', type: 'string', nullable: false, references: { table: 'menu_category', column: 'category_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'sectionId', columnName: 'section_id', type: 'string', nullable: false, references: { table: 'kitchen_section', column: 'section_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } }
        ],
        indexes: [
          { name: 'idx_category_section_unique', columns: ['category_id', 'section_id'], unique: true }
        ]
      },
      {
        name: 'menu_item',
        label: 'Menu Item',
        sqlName: 'menu_item',
        comment: 'Sellable menu items with pricing metadata.',
        layout: { x: 800, y: 260 },
        fields: [
          { name: 'id', columnName: 'item_id', type: 'integer', primaryKey: true, nullable: false },
          { name: 'sku', columnName: 'sku', type: 'string', nullable: true, maxLength: 64 },
          { name: 'categoryId', columnName: 'category_id', type: 'string', nullable: false, references: { table: 'menu_category', column: 'category_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'kitchenSectionId', columnName: 'kitchen_section_id', type: 'string', nullable: false, references: { table: 'kitchen_section', column: 'section_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 128 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 128 },
          { name: 'descriptionAr', columnName: 'description_ar', type: 'text', nullable: true },
          { name: 'descriptionEn', columnName: 'description_en', type: 'text', nullable: true },
          { name: 'basePrice', columnName: 'base_price', type: 'decimal', precision: 12, scale: 2, nullable: false },
          { name: 'taxGroupId', columnName: 'tax_group_id', type: 'string', nullable: true, maxLength: 32 },
          { name: 'isCombo', columnName: 'is_combo', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'isActive', columnName: 'is_active', type: 'boolean', nullable: false, defaultValue: true },
          { name: 'favoriteRank', columnName: 'favorite_rank', type: 'integer', nullable: true },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_menu_item_category', columns: ['category_id'] },
          { name: 'idx_menu_item_active', columns: ['is_active'] }
        ]
      },
      {
        name: 'menu_item_price',
        label: 'Menu Item Price',
        sqlName: 'menu_item_price',
        comment: 'Alternate price points for menu items (sizes, combos).',
        layout: { x: 1000, y: 260 },
        fields: [
          { name: 'id', columnName: 'price_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'itemId', columnName: 'item_id', type: 'integer', nullable: false, references: { table: 'menu_item', column: 'item_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'priceType', columnName: 'price_type', type: 'string', nullable: false, defaultValue: 'base' },
          { name: 'label', columnName: 'label', type: 'string', nullable: true, maxLength: 64 },
          { name: 'amount', columnName: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: false },
          { name: 'currency', columnName: 'currency', type: 'string', nullable: false, defaultValue: 'EGP' },
          { name: 'isDefault', columnName: 'is_default', type: 'boolean', nullable: false, defaultValue: false }
        ],
        indexes: [
          { name: 'idx_menu_item_price_item', columns: ['item_id'] }
        ]
      },
      {
        name: 'menu_item_media',
        label: 'Menu Item Media',
        sqlName: 'menu_item_media',
        comment: 'Rich media assets associated with menu items.',
        layout: { x: 920, y: 340 },
        fields: [
          { name: 'id', columnName: 'media_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'itemId', columnName: 'item_id', type: 'integer', nullable: false, references: { table: 'menu_item', column: 'item_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'type', columnName: 'media_type', type: 'string', nullable: false, defaultValue: 'image' },
          { name: 'url', columnName: 'url', type: 'string', nullable: false },
          { name: 'isPrimary', columnName: 'is_primary', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_menu_item_media_item', columns: ['item_id'] }
        ]
      },
      {
        name: 'menu_modifier',
        label: 'Menu Modifier',
        sqlName: 'menu_modifier',
        comment: 'Configurable add-ons and removals.',
        layout: { x: 800, y: 360 },
        fields: [
          { name: 'id', columnName: 'modifier_id', type: 'integer', primaryKey: true, nullable: false },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 128 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 128 },
          { name: 'modifierType', columnName: 'modifier_type', type: 'string', nullable: false, defaultValue: 'add_on' },
          { name: 'priceChange', columnName: 'price_change', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'isActive', columnName: 'is_active', type: 'boolean', nullable: false, defaultValue: true }
        ]
      },
      {
        name: 'menu_item_modifier',
        label: 'Menu Item Modifier',
        sqlName: 'menu_item_modifier',
        comment: 'Bridge table connecting menu items to modifiers.',
        layout: { x: 920, y: 420 },
        fields: [
          { name: 'itemId', columnName: 'item_id', type: 'integer', nullable: false, references: { table: 'menu_item', column: 'item_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'modifierId', columnName: 'modifier_id', type: 'integer', nullable: false, references: { table: 'menu_modifier', column: 'modifier_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'isDefault', columnName: 'is_default', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'maxQuantity', columnName: 'max_quantity', type: 'integer', nullable: true }
        ],
        indexes: [
          { name: 'idx_menu_item_modifier_unique', columns: ['item_id', 'modifier_id'], unique: true }
        ]
      },
      {
        name: 'customer_profile',
        label: 'Customer Profile',
        sqlName: 'customer_profile',
        comment: 'Customers interacting with the POS.',
        layout: { x: 80, y: 260 },
        fields: [
          { name: 'id', columnName: 'customer_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'name', columnName: 'customer_name', type: 'string', nullable: false, maxLength: 128 },
          { name: 'phone', columnName: 'phone', type: 'string', nullable: true, maxLength: 32 },
          { name: 'email', columnName: 'email', type: 'string', nullable: true, maxLength: 96 },
          { name: 'preferredLanguage', columnName: 'preferred_language', type: 'string', nullable: true, maxLength: 8 },
          { name: 'notes', columnName: 'notes', type: 'text', nullable: true },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_customer_phone', columns: ['phone'] }
        ]
      },
      {
        name: 'customer_address',
        label: 'Customer Address',
        sqlName: 'customer_address',
        comment: 'Saved addresses for delivery orders.',
        layout: { x: 80, y: 360 },
        fields: [
          { name: 'id', columnName: 'address_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'customerId', columnName: 'customer_id', type: 'string', nullable: false, references: { table: 'customer_profile', column: 'customer_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'label', columnName: 'label', type: 'string', nullable: true, maxLength: 64 },
          { name: 'areaId', columnName: 'area_id', type: 'string', nullable: true, maxLength: 64 },
          { name: 'street', columnName: 'street', type: 'string', nullable: true, maxLength: 128 },
          { name: 'building', columnName: 'building', type: 'string', nullable: true, maxLength: 64 },
          { name: 'floor', columnName: 'floor', type: 'string', nullable: true, maxLength: 16 },
          { name: 'apartment', columnName: 'apartment', type: 'string', nullable: true, maxLength: 16 },
          { name: 'notes', columnName: 'notes', type: 'text', nullable: true },
          { name: 'isPrimary', columnName: 'is_primary', type: 'boolean', nullable: false, defaultValue: false }
        ],
        indexes: [
          { name: 'idx_customer_address_customer', columns: ['customer_id'] }
        ]
      },
      {
        name: 'dining_table',
        label: 'Dining Table',
        sqlName: 'dining_table',
        comment: 'Physical tables available inside the venue.',
        layout: { x: 80, y: 460 },
        fields: [
          { name: 'id', columnName: 'table_id', type: 'string', primaryKey: true, nullable: false, maxLength: 32 },
          { name: 'name', columnName: 'table_name', type: 'string', nullable: false, maxLength: 64 },
          { name: 'seats', columnName: 'seats', type: 'integer', nullable: false, defaultValue: 2 },
          { name: 'zone', columnName: 'zone', type: 'string', nullable: true, maxLength: 32 },
          { name: 'state', columnName: 'state', type: 'string', nullable: false, defaultValue: 'active' },
          { name: 'displayOrder', columnName: 'display_order', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'note', columnName: 'note', type: 'text', nullable: true }
        ],
        indexes: [
          { name: 'idx_dining_table_zone', columns: ['zone'] }
        ]
      },
      {
        name: 'table_lock',
        label: 'Table Lock',
        sqlName: 'table_lock',
        comment: 'Active locks preventing concurrent seating.',
        layout: { x: 80, y: 560 },
        fields: [
          { name: 'id', columnName: 'lock_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'tableId', columnName: 'table_id', type: 'string', nullable: false, references: { table: 'dining_table', column: 'table_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'lockedBy', columnName: 'locked_by', type: 'string', nullable: true, references: { table: 'employee', column: 'employee_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'reason', columnName: 'reason', type: 'string', nullable: true, maxLength: 128 },
          { name: 'lockedAt', columnName: 'locked_at', type: 'timestamp', nullable: false },
          { name: 'expiresAt', columnName: 'expires_at', type: 'timestamp', nullable: true }
        ],
        indexes: [
          { name: 'idx_table_lock_table', columns: ['table_id'] }
        ]
      },
      {
        name: 'reservation',
        label: 'Reservation',
        sqlName: 'reservation',
        comment: 'Reservations captured for future seating.',
        layout: { x: 80, y: 660 },
        fields: [
          { name: 'id', columnName: 'reservation_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'customerName', columnName: 'customer_name', type: 'string', nullable: false, maxLength: 128 },
          { name: 'phone', columnName: 'phone', type: 'string', nullable: false, maxLength: 32 },
          { name: 'partySize', columnName: 'party_size', type: 'integer', nullable: false },
          { name: 'scheduledAt', columnName: 'scheduled_at', type: 'timestamp', nullable: false },
          { name: 'holdUntil', columnName: 'hold_until', type: 'timestamp', nullable: true },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'booked' },
          { name: 'note', columnName: 'note', type: 'text', nullable: true }
        ]
      },
      {
        name: 'reservation_table',
        label: 'Reservation Table Link',
        sqlName: 'reservation_table',
        comment: 'Bridge for many-to-many reservations and tables.',
        layout: { x: 220, y: 660 },
        fields: [
          { name: 'reservationId', columnName: 'reservation_id', type: 'string', nullable: false, references: { table: 'reservation', column: 'reservation_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'tableId', columnName: 'table_id', type: 'string', nullable: false, references: { table: 'dining_table', column: 'table_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } }
        ],
        indexes: [
          { name: 'idx_reservation_table_unique', columns: ['reservation_id', 'table_id'], unique: true }
        ]
      },
      {
        name: 'delivery_driver',
        label: 'Delivery Driver',
        sqlName: 'delivery_driver',
        comment: 'Delivery staff responsible for orders.',
        layout: { x: 200, y: 520 },
        fields: [
          { name: 'id', columnName: 'driver_id', type: 'integer', primaryKey: true, nullable: false },
          { name: 'name', columnName: 'driver_name', type: 'string', nullable: false, maxLength: 128 },
          { name: 'phone', columnName: 'phone', type: 'string', nullable: true, maxLength: 32 },
          { name: 'vehicleId', columnName: 'vehicle_id', type: 'string', nullable: true, maxLength: 128 },
          { name: 'isActive', columnName: 'is_active', type: 'boolean', nullable: false, defaultValue: true }
        ]
      },
      {
        name: 'order_header',
        label: 'Order Header',
        sqlName: 'order_header',
        comment: 'Primary sales order header tied to shifts and tables.',
        layout: { x: 320, y: 260 },
        fields: [
          { name: 'id', columnName: 'order_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'shiftId', columnName: 'shift_id', type: 'string', nullable: false, references: { table: 'pos_shift', column: 'shift_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'posId', columnName: 'pos_id', type: 'string', nullable: false, references: { table: 'pos_terminal', column: 'terminal_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'posNumber', columnName: 'pos_number', type: 'integer', nullable: false },
          { name: 'orderTypeId', columnName: 'order_type_id', type: 'string', nullable: false, references: { table: 'order_type', column: 'order_type_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'statusId', columnName: 'status_id', type: 'string', nullable: false, references: { table: 'order_status', column: 'status_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'stageId', columnName: 'stage_id', type: 'string', nullable: false, references: { table: 'order_stage', column: 'stage_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'paymentStateId', columnName: 'payment_state_id', type: 'string', nullable: false, references: { table: 'order_payment_state', column: 'payment_state_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'tableId', columnName: 'table_id', type: 'string', nullable: true, references: { table: 'dining_table', column: 'table_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'customerId', columnName: 'customer_id', type: 'string', nullable: true, references: { table: 'customer_profile', column: 'customer_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'customerAddressId', columnName: 'customer_address_id', type: 'string', nullable: true, references: { table: 'customer_address', column: 'address_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'driverId', columnName: 'driver_id', type: 'integer', nullable: true, references: { table: 'delivery_driver', column: 'driver_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'openedBy', columnName: 'opened_by', type: 'string', nullable: false, references: { table: 'employee', column: 'employee_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'closedBy', columnName: 'closed_by', type: 'string', nullable: true, references: { table: 'employee', column: 'employee_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'openedAt', columnName: 'opened_at', type: 'timestamp', nullable: false },
          { name: 'closedAt', columnName: 'closed_at', type: 'timestamp', nullable: true },
          { name: 'guests', columnName: 'guests', type: 'integer', nullable: false, defaultValue: 1 },
          { name: 'notes', columnName: 'notes', type: 'json', nullable: false, defaultValue: [] },
          { name: 'subtotal', columnName: 'subtotal', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'discount', columnName: 'discount_amount', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'service', columnName: 'service_amount', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'tax', columnName: 'tax_amount', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'deliveryFee', columnName: 'delivery_fee', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'totalDue', columnName: 'total_due', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'totalPaid', columnName: 'total_paid', type: 'decimal', precision: 14, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'metadata', columnName: 'metadata', type: 'json', nullable: false, defaultValue: {} }
        ],
        indexes: [
          { name: 'idx_order_header_shift', columns: ['shift_id', 'opened_at'] },
          { name: 'idx_order_header_customer', columns: ['customer_id'] }
        ]
      },
      {
        name: 'order_line',
        label: 'Order Line',
        sqlName: 'order_line',
        comment: 'Line items included in orders.',
        layout: { x: 560, y: 260 },
        fields: [
          { name: 'id', columnName: 'line_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'orderId', columnName: 'order_id', type: 'string', nullable: false, references: { table: 'order_header', column: 'order_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'parentLineId', columnName: 'parent_line_id', type: 'string', nullable: true, references: { table: 'order_line', column: 'line_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'itemId', columnName: 'item_id', type: 'integer', nullable: false, references: { table: 'menu_item', column: 'item_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'kitchenSectionId', columnName: 'kitchen_section_id', type: 'string', nullable: true, references: { table: 'kitchen_section', column: 'section_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'statusId', columnName: 'status_id', type: 'string', nullable: false, references: { table: 'order_line_status', column: 'line_status_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'quantity', columnName: 'quantity', type: 'decimal', precision: 10, scale: 3, nullable: false, defaultValue: 1 },
          { name: 'unitPrice', columnName: 'unit_price', type: 'decimal', precision: 12, scale: 2, nullable: false },
          { name: 'total', columnName: 'total', type: 'decimal', precision: 14, scale: 2, nullable: false },
          { name: 'notes', columnName: 'notes', type: 'text', nullable: true },
          { name: 'metadata', columnName: 'metadata', type: 'json', nullable: false, defaultValue: {} }
        ],
        indexes: [
          { name: 'idx_order_line_order', columns: ['order_id'] }
        ]
      },
      {
        name: 'order_line_modifier',
        label: 'Order Line Modifier',
        sqlName: 'order_line_modifier',
        comment: 'Captured modifiers applied to an order line.',
        layout: { x: 800, y: 420 },
        fields: [
          { name: 'id', columnName: 'line_modifier_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'lineId', columnName: 'line_id', type: 'string', nullable: false, references: { table: 'order_line', column: 'line_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'modifierId', columnName: 'modifier_id', type: 'integer', nullable: false, references: { table: 'menu_modifier', column: 'modifier_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'modifierType', columnName: 'modifier_type', type: 'string', nullable: false, defaultValue: 'add_on' },
          { name: 'priceChange', columnName: 'price_change', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0 }
        ],
        indexes: [
          { name: 'idx_order_line_modifier_line', columns: ['line_id'] }
        ]
      },
      {
        name: 'order_payment',
        label: 'Order Payment',
        sqlName: 'order_payment',
        comment: 'Captured payments for orders.',
        layout: { x: 320, y: 420 },
        fields: [
          { name: 'id', columnName: 'payment_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'orderId', columnName: 'order_id', type: 'string', nullable: false, references: { table: 'order_header', column: 'order_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'shiftId', columnName: 'shift_id', type: 'string', nullable: false, references: { table: 'pos_shift', column: 'shift_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'paymentMethodId', columnName: 'payment_method_id', type: 'string', nullable: false, references: { table: 'payment_method', column: 'payment_method_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'amount', columnName: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'capturedAt', columnName: 'captured_at', type: 'timestamp', nullable: false },
          { name: 'reference', columnName: 'reference', type: 'string', nullable: true, maxLength: 96 }
        ],
        indexes: [
          { name: 'idx_order_payment_order', columns: ['order_id'] },
          { name: 'idx_order_payment_shift', columns: ['shift_id'] }
        ]
      },
      {
        name: 'order_refund',
        label: 'Order Refund',
        sqlName: 'order_refund',
        comment: 'Refunded amounts linked back to original payments.',
        layout: { x: 560, y: 420 },
        fields: [
          { name: 'id', columnName: 'refund_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'paymentId', columnName: 'payment_id', type: 'string', nullable: false, references: { table: 'order_payment', column: 'payment_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'shiftId', columnName: 'shift_id', type: 'string', nullable: false, references: { table: 'pos_shift', column: 'shift_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' } },
          { name: 'amount', columnName: 'amount', type: 'decimal', precision: 12, scale: 2, nullable: false, defaultValue: 0 },
          { name: 'reason', columnName: 'reason', type: 'string', nullable: true, maxLength: 256 },
          { name: 'refundedAt', columnName: 'refunded_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_order_refund_payment', columns: ['payment_id'] }
        ]
      },
      {
        name: 'order_delivery',
        label: 'Order Delivery',
        sqlName: 'order_delivery',
        comment: 'Delivery routing and status for delivery orders.',
        layout: { x: 560, y: 520 },
        fields: [
          { name: 'orderId', columnName: 'order_id', type: 'string', primaryKey: true, nullable: false, references: { table: 'order_header', column: 'order_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' } },
          { name: 'driverId', columnName: 'driver_id', type: 'integer', nullable: true, references: { table: 'delivery_driver', column: 'driver_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'dispatchedAt', columnName: 'dispatched_at', type: 'timestamp', nullable: true },
          { name: 'deliveredAt', columnName: 'delivered_at', type: 'timestamp', nullable: true },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'pending' },
          { name: 'notes', columnName: 'notes', type: 'text', nullable: true }
        ]
      },
      {
        name: 'audit_event',
        label: 'Audit Event',
        sqlName: 'audit_event',
        comment: 'Actions performed within the POS for traceability.',
        layout: { x: 320, y: 520 },
        fields: [
          { name: 'id', columnName: 'event_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'userId', columnName: 'user_id', type: 'string', nullable: false, references: { table: 'employee', column: 'employee_id', onDelete: 'SET NULL', onUpdate: 'CASCADE' } },
          { name: 'action', columnName: 'action', type: 'string', nullable: false, maxLength: 96 },
          { name: 'refType', columnName: 'ref_type', type: 'string', nullable: false, maxLength: 64 },
          { name: 'refId', columnName: 'ref_id', type: 'string', nullable: true, maxLength: 64 },
          { name: 'occurredAt', columnName: 'occurred_at', type: 'timestamp', nullable: false },
          { name: 'meta', columnName: 'meta', type: 'json', nullable: false, defaultValue: {} }
        ]
      }
    ]
  };

  if (global && typeof global === 'object') {
    global.MishkahPOSSchema = MishkahPOSSchema;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
