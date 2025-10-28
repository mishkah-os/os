(function(global){
  const MishkahKDSSchema = {
    name: 'mishkah_kds',
    version: 1,
    tables: [
      {
        name: 'kds_station',
        label: 'Kitchen Display Station',
        sqlName: 'kds_station',
        comment: 'Registered KDS stations including prep lines and expo pass.',
        layout: { x: 80, y: 40 },
        fields: [
          { name: 'id', columnName: 'station_id', type: 'string', primaryKey: true, nullable: false, maxLength: 48 },
          { name: 'code', columnName: 'station_code', type: 'string', nullable: false, unique: true, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 96 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 96 },
          { name: 'stationType', columnName: 'station_type', type: 'string', nullable: false, defaultValue: 'prep' },
          { name: 'isExpo', columnName: 'is_expo', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'sequence', columnName: 'sequence', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'themeColor', columnName: 'theme_color', type: 'string', nullable: true, maxLength: 16 },
          { name: 'autoRouteRules', columnName: 'auto_route_rules', type: 'json', nullable: false, defaultValue: [] },
          { name: 'displayConfig', columnName: 'display_config', type: 'json', nullable: false, defaultValue: {} },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_kds_station_type', columns: ['station_type', 'sequence'] }
        ]
      },
      {
        name: 'station_category_route',
        label: 'Station Category Route',
        sqlName: 'station_category_route',
        comment: 'Routing map that assigns menu categories to a specific KDS station.',
        layout: { x: 240, y: 40 },
        fields: [
          { name: 'id', columnName: 'route_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'categoryId', columnName: 'category_id', type: 'string', nullable: false, maxLength: 64 },
          {
            name: 'stationId',
            columnName: 'station_id',
            type: 'string',
            nullable: false,
            references: { table: 'kds_station', column: 'station_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }
          },
          { name: 'priority', columnName: 'priority', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'isActive', columnName: 'is_active', type: 'boolean', nullable: false, defaultValue: true },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_station_category_route_station', columns: ['station_id', 'is_active'] },
          { name: 'idx_station_category_route_category', columns: ['category_id', 'priority'] }
        ]
      },
      {
        name: 'job_order_header',
        label: 'Job Order Header',
        sqlName: 'job_order_header',
        comment: 'High level ticket per station that is produced by splitting a POS order.',
        layout: { x: 80, y: 220 },
        fields: [
          { name: 'id', columnName: 'job_order_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'orderId', columnName: 'order_id', type: 'string', nullable: false, maxLength: 64 },
          { name: 'orderNumber', columnName: 'order_number', type: 'string', nullable: false, maxLength: 32 },
          { name: 'posRevision', columnName: 'pos_revision', type: 'string', nullable: false, maxLength: 64 },
          { name: 'orderTypeId', columnName: 'order_type_id', type: 'string', nullable: false, maxLength: 32 },
          { name: 'serviceMode', columnName: 'service_mode', type: 'string', nullable: false, maxLength: 32 },
          {
            name: 'stationId',
            columnName: 'station_id',
            type: 'string',
            nullable: false,
            references: { table: 'kds_station', column: 'station_id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' }
          },
          { name: 'stationCode', columnName: 'station_code', type: 'string', nullable: false, maxLength: 32 },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'queued' },
          { name: 'progressState', columnName: 'progress_state', type: 'string', nullable: false, defaultValue: 'awaiting' },
          { name: 'totalItems', columnName: 'total_items', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'completedItems', columnName: 'completed_items', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'remainingItems', columnName: 'remaining_items', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'hasAlerts', columnName: 'has_alerts', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'isExpedite', columnName: 'is_expedite', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'tableLabel', columnName: 'table_label', type: 'string', nullable: true, maxLength: 32 },
          { name: 'customerName', columnName: 'customer_name', type: 'string', nullable: true, maxLength: 96 },
          { name: 'dueAt', columnName: 'due_at', type: 'timestamp', nullable: true },
          { name: 'acceptedAt', columnName: 'accepted_at', type: 'timestamp', nullable: true },
          { name: 'startedAt', columnName: 'started_at', type: 'timestamp', nullable: true },
          { name: 'readyAt', columnName: 'ready_at', type: 'timestamp', nullable: true },
          { name: 'completedAt', columnName: 'completed_at', type: 'timestamp', nullable: true },
          { name: 'expoAt', columnName: 'expo_at', type: 'timestamp', nullable: true },
          { name: 'syncChecksum', columnName: 'sync_checksum', type: 'string', nullable: true, maxLength: 96 },
          { name: 'notes', columnName: 'notes', type: 'text', nullable: true },
          { name: 'meta', columnName: 'meta', type: 'json', nullable: false, defaultValue: {} },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_job_order_header_station_status', columns: ['station_id', 'status', 'created_at'] },
          { name: 'idx_job_order_header_order', columns: ['order_id', 'station_id'] }
        ]
      },
      {
        name: 'job_order_detail',
        label: 'Job Order Detail',
        sqlName: 'job_order_detail',
        comment: 'Individual prep lines and items that belong to a station job order.',
        layout: { x: 320, y: 220 },
        fields: [
          { name: 'id', columnName: 'detail_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          {
            name: 'jobOrderId',
            columnName: 'job_order_id',
            type: 'string',
            nullable: false,
            references: { table: 'job_order_header', column: 'job_order_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }
          },
          { name: 'orderLineId', columnName: 'order_line_id', type: 'string', nullable: false, maxLength: 64 },
          { name: 'posLineRevision', columnName: 'pos_line_revision', type: 'string', nullable: false, maxLength: 64 },
          { name: 'itemId', columnName: 'item_id', type: 'string', nullable: false, maxLength: 64 },
          { name: 'itemSku', columnName: 'item_sku', type: 'string', nullable: true, maxLength: 48 },
          { name: 'itemNameAr', columnName: 'item_name_ar', type: 'string', nullable: false, maxLength: 128 },
          { name: 'itemNameEn', columnName: 'item_name_en', type: 'string', nullable: false, maxLength: 128 },
          { name: 'categoryId', columnName: 'category_id', type: 'string', nullable: false, maxLength: 64 },
          { name: 'quantity', columnName: 'quantity', type: 'decimal', precision: 10, scale: 2, nullable: false, defaultValue: 1 },
          { name: 'unit', columnName: 'unit', type: 'string', nullable: true, maxLength: 16 },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'queued' },
          { name: 'priority', columnName: 'priority', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'prepNotes', columnName: 'prep_notes', type: 'text', nullable: true },
          { name: 'allergens', columnName: 'allergens', type: 'json', nullable: false, defaultValue: [] },
          { name: 'startAt', columnName: 'start_at', type: 'timestamp', nullable: true },
          { name: 'finishAt', columnName: 'finish_at', type: 'timestamp', nullable: true },
          { name: 'lastActionBy', columnName: 'last_action_by', type: 'string', nullable: true, maxLength: 64 },
          { name: 'meta', columnName: 'meta', type: 'json', nullable: false, defaultValue: {} },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_job_order_detail_job', columns: ['job_order_id', 'status'] },
          { name: 'idx_job_order_detail_item', columns: ['item_id'] }
        ]
      },
      {
        name: 'job_order_detail_modifier',
        label: 'Job Order Detail Modifier',
        sqlName: 'job_order_detail_modifier',
        comment: 'Add-ons, removals and cooking instructions attached to a job order detail line.',
        layout: { x: 520, y: 220 },
        fields: [
          { name: 'id', columnName: 'modifier_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          {
            name: 'detailId',
            columnName: 'detail_id',
            type: 'string',
            nullable: false,
            references: { table: 'job_order_detail', column: 'detail_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }
          },
          { name: 'modifierType', columnName: 'modifier_type', type: 'string', nullable: false, maxLength: 32 },
          { name: 'nameAr', columnName: 'name_ar', type: 'string', nullable: false, maxLength: 128 },
          { name: 'nameEn', columnName: 'name_en', type: 'string', nullable: false, maxLength: 128 },
          { name: 'quantity', columnName: 'quantity', type: 'decimal', precision: 10, scale: 2, nullable: false, defaultValue: 1 },
          { name: 'isRequired', columnName: 'is_required', type: 'boolean', nullable: false, defaultValue: false },
          { name: 'notes', columnName: 'notes', type: 'text', nullable: true },
          { name: 'meta', columnName: 'meta', type: 'json', nullable: false, defaultValue: {} },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_job_order_detail_modifier_detail', columns: ['detail_id'] }
        ]
      },
      {
        name: 'job_order_status_history',
        label: 'Job Order Status History',
        sqlName: 'job_order_status_history',
        comment: 'Chronological history of job order header status transitions.',
        layout: { x: 80, y: 420 },
        fields: [
          { name: 'id', columnName: 'history_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          {
            name: 'jobOrderId',
            columnName: 'job_order_id',
            type: 'string',
            nullable: false,
            references: { table: 'job_order_header', column: 'job_order_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' }
          },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, maxLength: 32 },
          { name: 'reason', columnName: 'reason', type: 'string', nullable: true, maxLength: 256 },
          { name: 'actorId', columnName: 'actor_id', type: 'string', nullable: true, maxLength: 64 },
          { name: 'actorName', columnName: 'actor_name', type: 'string', nullable: true, maxLength: 96 },
          { name: 'actorRole', columnName: 'actor_role', type: 'string', nullable: true, maxLength: 64 },
          { name: 'changedAt', columnName: 'changed_at', type: 'timestamp', nullable: false },
          { name: 'meta', columnName: 'meta', type: 'json', nullable: false, defaultValue: {} }
        ],
        indexes: [
          { name: 'idx_job_order_status_history_job', columns: ['job_order_id', 'changed_at'] }
        ]
      },
      {
        name: 'expo_pass_ticket',
        label: 'Expo Pass Ticket',
        sqlName: 'expo_pass_ticket',
        comment: 'Aggregate of job orders used by the expeditor hand-off screen.',
        layout: { x: 320, y: 420 },
        fields: [
          { name: 'id', columnName: 'expo_ticket_id', type: 'string', primaryKey: true, nullable: false, maxLength: 64 },
          { name: 'orderId', columnName: 'order_id', type: 'string', nullable: false, maxLength: 64 },
          { name: 'orderNumber', columnName: 'order_number', type: 'string', nullable: false, maxLength: 32 },
          { name: 'jobOrderIds', columnName: 'job_order_ids', type: 'json', nullable: false, defaultValue: [] },
          { name: 'status', columnName: 'status', type: 'string', nullable: false, defaultValue: 'awaiting' },
          { name: 'readyItems', columnName: 'ready_items', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'totalItems', columnName: 'total_items', type: 'integer', nullable: false, defaultValue: 0 },
          { name: 'holdReason', columnName: 'hold_reason', type: 'string', nullable: true, maxLength: 256 },
          { name: 'runnerId', columnName: 'runner_id', type: 'string', nullable: true, maxLength: 64 },
          { name: 'runnerName', columnName: 'runner_name', type: 'string', nullable: true, maxLength: 96 },
          { name: 'callAt', columnName: 'call_at', type: 'timestamp', nullable: true },
          { name: 'deliveredAt', columnName: 'delivered_at', type: 'timestamp', nullable: true },
          { name: 'meta', columnName: 'meta', type: 'json', nullable: false, defaultValue: {} },
          { name: 'createdAt', columnName: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updatedAt', columnName: 'updated_at', type: 'timestamp', nullable: false }
        ],
        indexes: [
          { name: 'idx_expo_pass_ticket_status', columns: ['status', 'created_at'] }
        ]
      }
    ]
  };

  if (global && typeof global === 'object') {
    global.MishkahKDSSchema = MishkahKDSSchema;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
