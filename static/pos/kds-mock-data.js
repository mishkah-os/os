/**
 * بسم الله الرحمن الرحيم
 * FILE: kds-mock-data.js
 *
 * هذا الملف يقدم قاعدة بيانات تجريبية متكاملة لشاشة المطبخ (KDS).
 * يمثل كيفية انقسام طلبات الـ POS إلى Job Orders لكل محطة تحضير
 * مع محاكاة للمزامنة الثنائية عبر WebSockets.
 */

const kdsDatabase = {
  metadata: {
    generatedAt: '2024-05-09T12:10:00Z',
    source: 'mock',
    description: 'Sample KDS data illustrating job order headers, details and expo aggregation.',
    posSnapshotVersion: '2024.05.09-rc1',
    sync: {
      channel: 'websocket',
      lastSyncAt: '2024-05-09T12:10:05Z',
      pendingEvents: 0
    }
  },

  stations: [
    {
      id: 'hot_line',
      code: 'HOT',
      nameAr: 'خط السخن',
      nameEn: 'Hot Line',
      stationType: 'prep',
      isExpo: false,
      sequence: 1,
      themeColor: '#fb7185',
      autoRouteRules: [
        { type: 'category', value: 'sandwiches' },
        { type: 'category', value: 'hawawshi' },
        { type: 'category', value: 'combo_meals' }
      ],
      displayConfig: { layout: 'tabs', tab: 'hot_line', columns: 2 },
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:50:00Z'
    },
    {
      id: 'grill_line',
      code: 'GRILL',
      nameAr: 'خط المشاوي',
      nameEn: 'Grill Station',
      stationType: 'prep',
      isExpo: false,
      sequence: 2,
      themeColor: '#f97316',
      autoRouteRules: [
        { type: 'category', value: 'kilo_grills' },
        { type: 'category', value: 'grill_plates' }
      ],
      displayConfig: { layout: 'tabs', tab: 'grill_line', columns: 1 },
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:50:00Z'
    },
    {
      id: 'mandi_line',
      code: 'MANDI',
      nameAr: 'خط المندي',
      nameEn: 'Mandi & Kabsa',
      stationType: 'prep',
      isExpo: false,
      sequence: 3,
      themeColor: '#22d3ee',
      autoRouteRules: [
        { type: 'category', value: 'mandi' },
        { type: 'category', value: 'kabsa' }
      ],
      displayConfig: { layout: 'tabs', tab: 'mandi_line', columns: 1 },
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:50:00Z'
    },
    {
      id: 'dessert_bar',
      code: 'DESS',
      nameAr: 'خط الحلويات والمشروبات',
      nameEn: 'Dessert & Drinks',
      stationType: 'prep',
      isExpo: false,
      sequence: 4,
      themeColor: '#a855f7',
      autoRouteRules: [
        { type: 'category', value: 'desserts' },
        { type: 'category', value: 'beverages' }
      ],
      displayConfig: { layout: 'tabs', tab: 'dessert_bar', columns: 2 },
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:50:00Z'
    },
    {
      id: 'expo_pass',
      code: 'EXPO',
      nameAr: 'شاشة التسليم',
      nameEn: 'Expo Pass',
      stationType: 'expo',
      isExpo: true,
      sequence: 99,
      themeColor: '#38bdf8',
      autoRouteRules: [],
      displayConfig: { layout: 'aggregated', tab: 'expo', columns: 3 },
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:50:00Z'
    }
  ],

  stationCategoryRoutes: [
    {
      id: 'route-001',
      categoryId: 'sandwiches',
      stationId: 'hot_line',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-002',
      categoryId: 'hawawshi',
      stationId: 'hot_line',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-003',
      categoryId: 'combo_meals',
      stationId: 'hot_line',
      priority: 2,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-010',
      categoryId: 'kilo_grills',
      stationId: 'grill_line',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-011',
      categoryId: 'grill_plates',
      stationId: 'grill_line',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-020',
      categoryId: 'mandi',
      stationId: 'mandi_line',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-021',
      categoryId: 'kabsa',
      stationId: 'mandi_line',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-030',
      categoryId: 'desserts',
      stationId: 'dessert_bar',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    },
    {
      id: 'route-031',
      categoryId: 'beverages',
      stationId: 'dessert_bar',
      priority: 1,
      isActive: true,
      createdAt: '2024-05-01T08:00:00Z',
      updatedAt: '2024-05-09T11:45:00Z'
    }
  ],

  jobOrders: {
    headers: [],
    details: [],
    modifiers: [],
    statusHistory: [],
    expoPassTickets: []
  }
};

const root = typeof window !== 'undefined' ? window
  : (typeof globalThis !== 'undefined' ? globalThis
    : (typeof global !== 'undefined' ? global : this));

const cloneList = (list)=> Array.isArray(list) ? list.map(entry=> ({ ...entry })) : [];

const buildFallbackSections = ()=> kdsDatabase.stations.map(station=>({
  id: station.id,
  section_name: {
    ar: station.nameAr || station.code || station.id,
    en: station.nameEn || station.code || station.id
  },
  description: { ar: '', en: '' }
}));

const buildFallbackCategorySections = ()=> kdsDatabase.stationCategoryRoutes.map(route=>({
  category_id: route.categoryId,
  section_id: route.stationId
}));

const resolveMasterPayload = (baseDatabase)=>{
  const baseSettings = baseDatabase?.settings || {};
  const syncSettings = baseSettings.sync || {};
  const branchChannel = syncSettings.channel || syncSettings.branch_channel || 'branch-main';
  const fallbackSections = buildFallbackSections();
  const fallbackCategorySections = buildFallbackCategorySections();
  const baseKitchenSections = cloneList(baseDatabase?.kitchen_sections);
  const baseCategorySections = cloneList(baseDatabase?.category_sections);
  const baseCategories = cloneList(baseDatabase?.categories);
  const baseItems = cloneList(baseDatabase?.items);
  const master = {
    channel: branchChannel,
    sync: {
      channel: branchChannel,
      endpoint: syncSettings.ws_endpoint || syncSettings.wsEndpoint || null
    },
    metadata: {
      ...kdsDatabase.metadata,
      branchId: syncSettings.branch_id || syncSettings.branchId || branchChannel,
      branchName: syncSettings.branch_name || syncSettings.branchName || null
    },
    stations: cloneList(kdsDatabase.stations),
    stationCategoryRoutes: cloneList(kdsDatabase.stationCategoryRoutes),
    kitchenSections: baseKitchenSections.length ? baseKitchenSections : cloneList(fallbackSections),
    categorySections: baseCategorySections.length ? baseCategorySections : cloneList(fallbackCategorySections),
    categories: baseCategories,
    items: baseItems,
    drivers: cloneList(baseDatabase?.drivers),
    menu: {
      categories: baseCategories,
      items: baseItems
    }
  };
  if (!master.menu.categories.length) master.menu.categories = cloneList(baseCategories);
  if (!master.menu.items.length) master.menu.items = cloneList(baseItems);
  return master;
};

if (root && typeof root === 'object') {
  const baseDatabase = root.database && typeof root.database === 'object' ? root.database : null;
  const masterPayload = resolveMasterPayload(baseDatabase || {});
  kdsDatabase.master = masterPayload;
  root.kdsDatabase = kdsDatabase;
  if (baseDatabase) {
    baseDatabase.kds = { ...kdsDatabase, master: masterPayload };
  }
}
