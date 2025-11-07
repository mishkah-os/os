/**
 * Mishkah Admin Dashboard
 * Three-tab interface for backend management:
 * 1. JSON Viewer - Live data from /api/branches/:branch/modules/:module
 * 2. CRUD Manager - Table management with Mishkah DSL
 * 3. SQL Execute Tool - SQL query interface with schema tree
 */

(function () {
  'use strict';

  // Get Mishkah utilities
  const M = window.Mishkah;
  const D = M.DSL;
  const U = M.utils;

  // Get URL parameters
  const params = new URLSearchParams(window.location.search);
  const DEFAULT_BRANCH = params.get('branch') || params.get('branchId') || 'dar';
  const DEFAULT_MODULE = params.get('module') || params.get('moduleId') || 'pos';

  // =================================================================
  // Global Database (Single Source of Truth)
  // =================================================================
  window.database = {
    env: {
      theme: localStorage.getItem('admin-theme') || 'dark',
      lang: 'ar',
      dir: 'rtl'
    },
    config: {
      branchId: DEFAULT_BRANCH,
      moduleId: DEFAULT_MODULE
    },
    state: {
      activeTab: 'json-viewer',
      loading: false,
      error: null
    },
    jsonViewer: {
      data: null,
      lastUpdated: null,
      autoRefresh: false
    },
    crudManager: {
      selectedTable: null,
      tableData: [],
      schema: null
    },
    sqlExecute: {
      schema: null,
      query: 'SELECT * FROM order_header LIMIT 10',
      results: null,
      error: null,
      queryTime: null
    }
  };

  // =================================================================
  // Utility Functions
  // =================================================================

  /**
   * Fetch JSON from API
   */
  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Format JSON with syntax highlighting
   */
  function formatJson(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    const nextSpaces = '  '.repeat(indent + 1);

    if (obj === null) {
      return `<span class="json-null">null</span>`;
    }

    if (typeof obj === 'boolean') {
      return `<span class="json-boolean">${obj}</span>`;
    }

    if (typeof obj === 'number') {
      return `<span class="json-number">${obj}</span>`;
    }

    if (typeof obj === 'string') {
      return `<span class="json-string">"${obj}"</span>`;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      const items = obj.map(item => `${nextSpaces}${formatJson(item, indent + 1)}`).join(',\n');
      return `[\n${items}\n${spaces}]`;
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      const items = keys.map(key => {
        const value = formatJson(obj[key], indent + 1);
        return `${nextSpaces}<span class="json-key">"${key}"</span>: ${value}`;
      }).join(',\n');
      return `{\n${items}\n${spaces}}`;
    }

    return String(obj);
  }

  // =================================================================
  // API Functions
  // =================================================================

  /**
   * Load live data from branch/module endpoint
   */
  async function loadLiveData() {
    const { branchId, moduleId } = window.database.config;
    const url = `/api/branches/${branchId}/modules/${moduleId}`;
    const data = await fetchJson(url);
    return data;
  }

  /**
   * Load database schema
   */
  async function loadDatabaseSchema() {
    return fetchJson('/api/schema/database');
  }

  /**
   * Execute SQL query
   */
  async function executeQuery(query) {
    const { branchId, moduleId } = window.database.config;
    return fetchJson('/api/query/raw', {
      method: 'POST',
      body: JSON.stringify({ sql: query, branchId, moduleId })
    });
  }

  /**
   * Load table data using Query API
   */
  async function loadTableData(tableName, limit = 100) {
    const { branchId, moduleId } = window.database.config;
    return fetchJson('/api/query', {
      method: 'POST',
      body: JSON.stringify({
        table: tableName,
        branchId,
        moduleId,
        limit
      })
    });
  }

  // =================================================================
  // Components
  // =================================================================

  /**
   * Header Component
   */
  function Header(db) {
    const { branchId, moduleId } = db.config;
    const { theme } = db.env;

    return D.Containers.Header({ attrs: { class: 'admin-header' } }, [
      D.Containers.Div({}, [
        D.Text.H1({}, ['Mishkah Admin Dashboard']),
        D.Text.Small({ attrs: { style: 'color: var(--admin-muted); margin-right: 1rem;' } }, [
          `Branch: ${branchId} | Module: ${moduleId}`
        ])
      ]),
      D.Containers.Div({ attrs: { class: 'controls' } }, [
        D.Forms.Button({
          attrs: {
            class: 'btn',
            'data-m-gkey': 'toggle-theme'
          }
        }, [theme === 'dark' ? '🌞 Light' : '🌙 Dark']),
        D.Forms.Button({
          attrs: {
            class: 'btn btn-primary',
            'data-m-gkey': 'refresh-data'
          }
        }, ['🔄 Refresh'])
      ])
    ]);
  }

  /**
   * Tabs Sidebar Component
   */
  function TabsSidebar(db) {
    const { activeTab } = db.state;

    const tabs = [
      { id: 'json-viewer', label: '📊 JSON Viewer', desc: 'Live data explorer' },
      { id: 'crud-manager', label: '🗂️ CRUD Manager', desc: 'Table management' },
      { id: 'sql-execute', label: '⚡ SQL Execute', desc: 'Query interface' }
    ];

    return D.Containers.Aside({ attrs: { class: 'admin-tabs' } }, tabs.map(tab =>
      D.Containers.Div({
        attrs: {
          class: `admin-tab ${activeTab === tab.id ? 'active' : ''}`,
          'data-m-gkey': `switch-tab:${tab.id}`
        }
      }, [
        D.Text.Div({ attrs: { style: 'font-weight: 600;' } }, [tab.label]),
        D.Text.Small({ attrs: { style: 'font-size: 0.75rem; opacity: 0.7;' } }, [tab.desc])
      ])
    ));
  }

  /**
   * JSON Viewer Tab Component
   */
  function JsonViewerTab(db) {
    const { data, lastUpdated } = db.jsonViewer;
    const { loading, error } = db.state;

    return D.Containers.Div({ attrs: { class: 'admin-panel' } }, [
      D.Text.H2({}, ['JSON Viewer — Live Data']),

      // Controls
      D.Containers.Div({ attrs: { class: 'input-group' } }, [
        D.Forms.Input({
          attrs: {
            type: 'text',
            placeholder: 'Branch ID',
            value: db.config.branchId,
            'data-m-gkey': 'json-branch-input'
          }
        }),
        D.Forms.Input({
          attrs: {
            type: 'text',
            placeholder: 'Module ID',
            value: db.config.moduleId,
            'data-m-gkey': 'json-module-input'
          }
        }),
        D.Forms.Button({
          attrs: {
            class: 'btn btn-primary',
            'data-m-gkey': 'json-load-data'
          }
        }, ['Load Data'])
      ]),

      // Status
      lastUpdated ? D.Text.P({ attrs: { style: 'color: var(--admin-muted); margin-bottom: 1rem; font-size: 0.875rem;' } }, [
        `Last updated: ${new Date(lastUpdated).toLocaleString('ar-EG')}`
      ]) : null,

      // Content
      loading
        ? D.Containers.Div({ attrs: { class: 'loading' } }, ['Loading data'])
        : error
          ? D.Containers.Div({ attrs: { style: 'color: var(--admin-danger); padding: 2rem;' } }, [
              D.Text.Strong({}, ['Error: ']),
              error
            ])
          : data
            ? D.Containers.Pre({
                attrs: {
                  class: 'json-viewer',
                  style: 'flex: 1; overflow: auto;'
                }
              }, [
                D.Containers.Code({ attrs: { class: 'json-tree' } }, [
                  { __html: formatJson(data) }
                ])
              ])
            : D.Containers.Div({ attrs: { style: 'text-align: center; padding: 3rem; color: var(--admin-muted);' } }, [
                'Click "Load Data" to fetch live data'
              ])
    ]);
  }

  /**
   * CRUD Manager Tab Component
   */
  function CrudManagerTab(db) {
    const { selectedTable, tableData, schema } = db.crudManager;
    const { loading, error } = db.state;

    const tables = schema?.tables?.map(t => t.name) || [];

    return D.Containers.Div({ attrs: { class: 'admin-panel' } }, [
      D.Text.H2({}, ['CRUD Manager — Table Management']),

      // Table selection
      D.Containers.Div({ attrs: { class: 'input-group' } }, [
        D.Forms.Select({
          attrs: {
            'data-m-gkey': 'crud-table-select'
          }
        }, [
          D.Forms.Option({ attrs: { value: '' } }, ['Select Table...']),
          ...tables.map(table =>
            D.Forms.Option({
              attrs: {
                value: table,
                selected: table === selectedTable
              }
            }, [table])
          )
        ]),
        D.Forms.Button({
          attrs: {
            class: 'btn btn-primary',
            'data-m-gkey': 'crud-load-table'
          }
        }, ['Load Table'])
      ]),

      // Table data
      loading
        ? D.Containers.Div({ attrs: { class: 'loading' } }, ['Loading table data'])
        : error
          ? D.Containers.Div({ attrs: { style: 'color: var(--admin-danger); padding: 2rem;' } }, [error])
          : tableData.length > 0
            ? D.Containers.Div({ attrs: { style: 'overflow: auto; flex: 1;' } }, [
                D.Containers.Table({ attrs: { class: 'crud-table' } }, [
                  D.Containers.Thead({}, [
                    D.Containers.Tr({}, [
                      ...Object.keys(tableData[0] || {}).map(key =>
                        D.Containers.Th({}, [key])
                      )
                    ])
                  ]),
                  D.Containers.Tbody({},
                    tableData.slice(0, 100).map(row =>
                      D.Containers.Tr({}, [
                        ...Object.values(row).map(value =>
                          D.Containers.Td({}, [
                            typeof value === 'object'
                              ? JSON.stringify(value).substring(0, 50) + '...'
                              : String(value).substring(0, 50)
                          ])
                        )
                      ])
                    )
                  )
                ])
              ])
            : D.Containers.Div({ attrs: { style: 'text-align: center; padding: 3rem; color: var(--admin-muted);' } }, [
                'Select a table and click "Load Table"'
              ])
    ]);
  }

  /**
   * SQL Execute Tab Component
   */
  function SqlExecuteTab(db) {
    const { schema, results, error, queryTime } = db.sqlExecute;
    const { loading } = db.state;

    const tables = schema?.tables || [];

    return D.Containers.Div({ attrs: { class: 'admin-panel' } }, [
      D.Text.H2({}, ['SQL Execute — Query Interface']),

      D.Containers.Div({ attrs: { class: 'sql-execute-layout' } }, [
        // Sidebar with schema tree
        D.Containers.Div({ attrs: { class: 'sql-sidebar' } }, [
          D.Text.H3({}, ['Database Schema']),
          D.Containers.Ul({ attrs: { class: 'sql-tree' } }, tables.map(table =>
            D.Containers.Li({
              attrs: {
                class: 'sql-tree-item',
                'data-m-gkey': `sql-table:${table.name}`
              }
            }, [
              `📋 ${table.name} (${table.columns?.length || 0} cols)`
            ])
          ))
        ]),

        // Main area
        D.Containers.Div({ attrs: { class: 'sql-main' } }, [
          // SQL Editor
          D.Containers.Div({ attrs: { class: 'sql-editor-wrapper' } }, [
            D.Containers.Textarea({
              attrs: {
                id: 'sql-editor',
                'data-m-gkey': 'sql-query-input',
                style: 'width: 100%; height: 100%; padding: 1rem; font-family: monospace; font-size: 0.875rem; border: none; resize: none;'
              }
            }, [db.sqlExecute.query || 'SELECT * FROM order_header LIMIT 10'])
          ]),

          // Controls
          D.Containers.Div({ attrs: { style: 'display: flex; gap: 1rem;' } }, [
            D.Forms.Button({
              attrs: {
                class: 'btn btn-primary',
                'data-m-gkey': 'sql-execute-query'
              }
            }, ['▶️ Execute Query']),
            queryTime ? D.Text.Span({
              attrs: {
                class: 'status-badge status-success'
              }
            }, [`Executed in ${queryTime}ms`]) : null
          ]),

          // Results
          loading
            ? D.Containers.Div({ attrs: { class: 'loading' } }, ['Executing query'])
            : error
              ? D.Containers.Div({ attrs: { class: 'sql-results', style: 'color: var(--admin-danger);' } }, [
                  D.Text.Strong({}, ['Error: ']),
                  error
                ])
              : results
                ? D.Containers.Div({ attrs: { class: 'sql-results', style: 'overflow: auto;' } }, [
                    D.Text.P({ attrs: { style: 'margin-bottom: 1rem; color: var(--admin-muted);' } }, [
                      `Returned ${results.rows?.length || 0} rows`
                    ]),
                    results.rows?.length > 0
                      ? D.Containers.Table({ attrs: { class: 'crud-table' } }, [
                          D.Containers.Thead({}, [
                            D.Containers.Tr({}, [
                              ...Object.keys(results.rows[0] || {}).map(key =>
                                D.Containers.Th({}, [key])
                              )
                            ])
                          ]),
                          D.Containers.Tbody({},
                            results.rows.map(row =>
                              D.Containers.Tr({}, [
                                ...Object.values(row).map(value =>
                                  D.Containers.Td({}, [
                                    typeof value === 'object'
                                      ? JSON.stringify(value).substring(0, 100) + '...'
                                      : String(value).substring(0, 100)
                                  ])
                                )
                              ])
                            )
                          )
                        ])
                      : D.Text.P({}, ['No rows returned'])
                  ])
                : D.Containers.Div({ attrs: { style: 'text-align: center; padding: 3rem; color: var(--admin-muted);' } }, [
                    'Write your SQL query and click "Execute"'
                  ])
        ])
      ])
    ]);
  }

  /**
   * Main App Component
   */
  function AppBody(db) {
    const { activeTab } = db.state;

    const tabContent = activeTab === 'json-viewer'
      ? JsonViewerTab(db)
      : activeTab === 'crud-manager'
        ? CrudManagerTab(db)
        : SqlExecuteTab(db);

    return D.Containers.Div({}, [
      Header(db),
      D.Containers.Main({ attrs: { class: 'admin-main' } }, [
        TabsSidebar(db),
        D.Containers.Div({ attrs: { class: 'admin-content' } }, [tabContent])
      ])
    ]);
  }

  // =================================================================
  // Event Handlers (Orders)
  // =================================================================

  const orders = {
    'toggle.theme': {
      on: ['click'],
      gkeys: ['toggle-theme'],
      handler: (e, ctx) => {
        const currentTheme = ctx.database.env.theme;
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        ctx.setState(db => ({
          ...db,
          env: { ...db.env, theme: newTheme }
        }));
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('admin-theme', newTheme);
      }
    },

    'refresh.data': {
      on: ['click'],
      gkeys: ['refresh-data'],
      handler: async (e, ctx) => {
        const { activeTab } = ctx.database.state;
        if (activeTab === 'json-viewer') {
          await orders['json.loadData'].handler(e, ctx);
        } else if (activeTab === 'crud-manager') {
          await orders['crud.loadTable'].handler(e, ctx);
        }
      }
    },

    'switch.tab': {
      on: ['click'],
      gkeys: ['switch-tab:json-viewer', 'switch-tab:crud-manager', 'switch-tab:sql-execute'],
      handler: (e, ctx) => {
        const gkey = e.currentTarget.getAttribute('data-m-gkey');
        const tabId = gkey.split(':')[1];
        ctx.setState(db => ({
          ...db,
          state: { ...db.state, activeTab: tabId }
        }));
      }
    },

    'json.loadData': {
      on: ['click'],
      gkeys: ['json-load-data'],
      handler: async (e, ctx) => {
        ctx.setState(db => ({
          ...db,
          state: { ...db.state, loading: true, error: null }
        }));

        try {
          const data = await loadLiveData();
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            jsonViewer: {
              ...db.jsonViewer,
              data,
              lastUpdated: new Date().toISOString()
            }
          }));
        } catch (error) {
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false, error: error.message }
          }));
        }
      }
    },

    'crud.loadTable': {
      on: ['click'],
      gkeys: ['crud-load-table'],
      handler: async (e, ctx) => {
        const { selectedTable } = ctx.database.crudManager;
        if (!selectedTable) return;

        ctx.setState(db => ({
          ...db,
          state: { ...db.state, loading: true, error: null }
        }));

        try {
          const result = await loadTableData(selectedTable);
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            crudManager: {
              ...db.crudManager,
              tableData: result.rows || []
            }
          }));
        } catch (error) {
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false, error: error.message }
          }));
        }
      }
    },

    'crud.selectTable': {
      on: ['change'],
      gkeys: ['crud-table-select'],
      handler: (e, ctx) => {
        const tableName = e.target.value;
        ctx.setState(db => ({
          ...db,
          crudManager: {
            ...db.crudManager,
            selectedTable: tableName,
            tableData: []
          }
        }));
      }
    },

    'sql.executeQuery': {
      on: ['click'],
      gkeys: ['sql-execute-query'],
      handler: async (e, ctx) => {
        const query = ctx.database.sqlExecute.query;
        if (!query) return;

        ctx.setState(db => ({
          ...db,
          state: { ...db.state, loading: true },
          sqlExecute: { ...db.sqlExecute, error: null, results: null }
        }));

        const startTime = Date.now();

        try {
          const result = await executeQuery(query);
          const duration = Date.now() - startTime;

          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            sqlExecute: {
              ...db.sqlExecute,
              results: result,
              queryTime: duration
            }
          }));
        } catch (error) {
          ctx.setState(db => ({
            ...db,
            state: { ...db.state, loading: false },
            sqlExecute: {
              ...db.sqlExecute,
              error: error.message,
              queryTime: null
            }
          }));
        }
      }
    },

    'sql.updateQuery': {
      on: ['input', 'change'],
      gkeys: ['sql-query-input'],
      handler: (e, ctx) => {
        const query = e.target.value;
        ctx.setState(db => ({
          ...db,
          sqlExecute: { ...db.sqlExecute, query }
        }));
      }
    }
  };

  // =================================================================
  // Initialize App
  // =================================================================

  // Load initial data
  (async () => {
    try {
      // Load database schema for CRUD and SQL tabs
      const schema = await loadDatabaseSchema();
      window.database.crudManager.schema = schema;
      window.database.sqlExecute.schema = schema;

      // Set initial theme
      document.documentElement.setAttribute('data-theme', window.database.env.theme);

      // Initialize Mishkah app
      M.app({
        id: 'admin-dashboard',
        root: '#app',
        database: window.database,
        body: AppBody,
        orders,
        onError: (error) => {
          console.error('[Mishkah] App error:', error);
        }
      });
    } catch (error) {
      console.error('[Admin Dashboard] Initialization failed:', error);
      document.getElementById('app').innerHTML = `
        <div style="
          display: grid;
          place-items: center;
          height: 100vh;
          color: var(--admin-danger);
          font-size: 1.25rem;
        ">
          ❌ Failed to initialize dashboard: ${error.message}
        </div>
      `;
    }
  })();

})();
