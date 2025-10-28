(function(){
  const M = window.Mishkah;
  if(!M || !M.utils || !M.DSL) return;

  const UI = M.UI || {};
  const U = M.utils;
  const D = M.DSL;
  const { tw, cx } = U.twcss;

  const hasStructuredClone = typeof structuredClone === 'function';
  const JSONX = U.JSON || {};
  const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const cloneDeep = (value)=>{
    if(value == null) return value;
    if(JSONX && typeof JSONX.clone === 'function') return JSONX.clone(value);
    if(hasStructuredClone){
      try{ return structuredClone(value); } catch(_err){}
    }
    try{ return JSON.parse(JSON.stringify(value)); } catch(_err){
      if(Array.isArray(value)) return value.map(entry=> cloneDeep(entry));
      if(isPlainObject(value)) return Object.keys(value).reduce((acc,key)=>{ acc[key] = cloneDeep(value[key]); return acc; }, {});
      return value;
    }
  };

  const normalizeChannelName = (value, fallback='default')=>{
    const base = value == null ? '' : String(value).trim();
    const raw = base || fallback || 'default';
    return raw.replace(/[^A-Za-z0-9:_-]+/g, '-').toLowerCase();
  };

  const TEXT_DICT = {
    "title": {
      "ar": "مشكاة — شاشة المطبخ",
      "en": "Mishkah — Kitchen display"
    },
    "subtitle": {
      "ar": "إدارة التحضير والتسليم لحظيًا",
      "en": "Live preparation and dispatch management"
    },
    "status": {
      "online": {
        "ar": "🟢 متصل",
        "en": "🟢 Online"
      },
      "offline": {
        "ar": "🔴 غير متصل",
        "en": "🔴 Offline"
      },
      "syncing": {
        "ar": "🔄 مزامنة",
        "en": "🔄 Syncing"
      }
    },
    "stats": {
      "total": {
        "ar": "إجمالي الأوامر",
        "en": "Total jobs"
      },
      "expedite": {
        "ar": "أوامر عاجلة",
        "en": "Expedite"
      },
      "alerts": {
        "ar": "تنبيهات",
        "en": "Alerts"
      },
      "ready": {
        "ar": "جاهز",
        "en": "Ready"
      },
      "pending": {
        "ar": "قيد التحضير",
        "en": "In progress"
      }
    },
    "tabs": {
      "prep": {
        "ar": "كل الأقسام",
        "en": "All stations"
      },
      "expo": {
        "ar": "شاشة التجميع",
        "en": "Expo pass"
      },
      "handoff": {
        "ar": "شاشة التسليم",
        "en": "Service handoff"
      },
      "delivery": {
        "ar": "تسليم الدليفري",
        "en": "Delivery handoff"
      },
      "pendingDelivery": {
        "ar": "معلقات الدليفري",
        "en": "Delivery settlements"
      }
    },
    "empty": {
      "prep": {
        "ar": "لا توجد طلبات محفوظة بعد.",
        "en": "No orders have been saved yet."
      },
      "station": {
        "ar": "لا توجد أوامر لهذا القسم حاليًا.",
        "en": "No active tickets for this station."
      },
      "expo": {
        "ar": "لا توجد تذاكر تجميع حالية.",
        "en": "No expo tickets at the moment."
      },
      "handoff": {
        "ar": "لا توجد طلبات جاهزة للتسليم الآن.",
        "en": "No orders awaiting handoff right now."
      },
      "delivery": {
        "ar": "لا توجد طلبات دليفري حالية.",
        "en": "No delivery orders right now."
      },
      "pending": {
        "ar": "لا توجد طلبات دليفري معلقة للتحصيل.",
        "en": "No outstanding delivery settlements."
      }
    },
    "actions": {
      "start": {
        "ar": "بدء التجهيز",
        "en": "Start prep"
      },
      "finish": {
        "ar": "تم التجهيز",
        "en": "Mark ready"
      },
      "assignDriver": {
        "ar": "تعيين السائق",
        "en": "Assign driver"
      },
      "delivered": {
        "ar": "تم التسليم",
        "en": "Delivered"
      },
      "handoffComplete": {
        "ar": "تم التجميع",
        "en": "Mark assembled"
      },
      "handoffServe": {
        "ar": "تم التسليم",
        "en": "Mark served"
      },
      "settle": {
        "ar": "تسوية التحصيل",
        "en": "Settle payment"
      }
    },
    "labels": {
      "order": {
        "ar": "طلب",
        "en": "Order"
      },
      "table": {
        "ar": "طاولة",
        "en": "Table"
      },
      "customer": {
        "ar": "عميل",
        "en": "Guest"
      },
      "station": {
        "ar": "المحطة",
        "en": "Station"
      },
      "due": {
        "ar": "الاستحقاق",
        "en": "Due at"
      },
      "timer": {
        "ar": "المدة",
        "en": "Duration"
      },
      "driver": {
        "ar": "السائق",
        "en": "Driver"
      },
      "driverPhone": {
        "ar": "رقم السائق",
        "en": "Driver phone"
      },
      "notAssigned": {
        "ar": "لم يتم التعيين بعد",
        "en": "Not assigned yet"
      },
      "handoffStatus": {
        "pending": {
          "ar": "قيد التحضير",
          "en": "In progress"
        },
        "ready": {
          "ar": "جاهز للتجميع",
          "en": "Ready to assemble"
        },
        "assembled": {
          "ar": "جاهز للتسليم",
          "en": "Ready for handoff"
        },
        "served": {
          "ar": "تم التسليم",
          "en": "Completed"
        }
      },
      "serviceMode": {
        "dine_in": {
          "ar": "صالة",
          "en": "Dine-in"
        },
        "delivery": {
          "ar": "دليفري",
          "en": "Delivery"
        },
        "takeaway": {
          "ar": "تيك أواي",
          "en": "Takeaway"
        },
        "pickup": {
          "ar": "استلام",
          "en": "Pickup"
        }
      },
      "jobStatus": {
        "queued": {
          "ar": "بانتظار",
          "en": "Queued"
        },
        "awaiting": {
          "ar": "بانتظار",
          "en": "Awaiting"
        },
        "accepted": {
          "ar": "تم القبول",
          "en": "Accepted"
        },
        "in_progress": {
          "ar": "قيد التحضير",
          "en": "Preparing"
        },
        "cooking": {
          "ar": "قيد التحضير",
          "en": "Preparing"
        },
        "ready": {
          "ar": "جاهز",
          "en": "Ready"
        },
        "completed": {
          "ar": "مكتمل",
          "en": "Completed"
        },
        "cancelled": {
          "ar": "ملغي",
          "en": "Cancelled"
        },
        "paused": {
          "ar": "متوقف",
          "en": "Paused"
        }
      },
      "deliveryStatus": {
        "pending": {
          "ar": "بانتظار التسليم",
          "en": "Pending dispatch"
        },
        "assigned": {
          "ar": "تم تعيين السائق",
          "en": "Driver assigned"
        },
        "onRoute": {
          "ar": "في الطريق",
          "en": "On the way"
        },
        "delivered": {
          "ar": "تم التسليم",
          "en": "Delivered"
        },
        "settled": {
          "ar": "تم التحصيل",
          "en": "Settled"
        }
      },
      "expoReady": {
        "ar": "جاهز للتسليم",
        "en": "Ready to handoff"
      },
      "expoPending": {
        "ar": "بانتظار الأقسام",
        "en": "Waiting for stations"
      }
    },
    "modal": {
      "driverTitle": {
        "ar": "اختر السائق المناسب",
        "en": "Select a driver"
      },
      "driverDescription": {
        "ar": "حدد السائق المسؤول عن الطلب، وسيتم إعلام نقطة البيع فورًا.",
        "en": "Choose who will handle the delivery. POS will be notified instantly."
      },
      "close": {
        "ar": "إغلاق",
        "en": "Close"
      }
    },
    "controls": {
      "theme": {
        "ar": "المظهر",
        "en": "Theme"
      },
      "light": {
        "ar": "نهاري",
        "en": "Light"
      },
      "dark": {
        "ar": "ليلي",
        "en": "Dark"
      },
      "language": {
        "ar": "اللغة",
        "en": "Language"
      },
      "arabic": {
        "ar": "عربي",
        "en": "Arabic"
      },
      "english": {
        "ar": "إنجليزي",
        "en": "English"
      }
    }
  };

  const flattenTextDict = (node, prefix=[])=>{
    const flat = {};
    Object.keys(node).forEach(key=>{
      const value = node[key];
      const path = prefix.concat(key);
      if(value && typeof value === 'object' && !Array.isArray(value) && !('ar' in value || 'en' in value)){
        Object.assign(flat, flattenTextDict(value, path));
      } else {
        flat[path.join('.')] = value;
      }
    });
    return flat;
  };

  const inflateTexts = (node, resolver, prefix=[])=>{
    if(node && typeof node === 'object' && !Array.isArray(node)){
      if('ar' in node || 'en' in node){
        const key = prefix.join('.');
        return resolver(key);
      }
      const out = {};
      Object.keys(node).forEach(key=>{
        out[key] = inflateTexts(node[key], resolver, prefix.concat(key));
      });
      return out;
    }
    return node;
  };

  const TEXT_FLAT = flattenTextDict(TEXT_DICT);

  const getTexts = (db)=>{
    const langContext = { env:{ lang: db?.env?.lang }, i18n:{ dict: TEXT_FLAT, fallback:'ar' } };
    const { TL } = U.lang.makeLangLookup(langContext);
    return inflateTexts(TEXT_DICT, TL, []);
  };

  const STATUS_PRIORITY = { ready:4, completed:4, in_progress:3, cooking:3, accepted:2, queued:1, awaiting:1, paused:0, cancelled:-1 };
  const STATUS_CLASS = {
    queued: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    awaiting: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    accepted: tw`border-sky-300/40 bg-sky-400/10 text-sky-100`,
    in_progress: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    cooking: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    ready: tw`border-emerald-300/50 bg-emerald-500/10 text-emerald-50`,
    completed: tw`border-emerald-400/60 bg-emerald-500/20 text-emerald-50`,
    paused: tw`border-slate-400/50 bg-slate-500/10 text-slate-200`,
    cancelled: tw`border-rose-400/60 bg-rose-500/15 text-rose-100`
  };

  const DELIVERY_STATUS_CLASS = {
    pending: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    assigned: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    onRoute: tw`border-sky-300/50 bg-sky-500/10 text-sky-50`,
    delivered: tw`border-emerald-300/50 bg-emerald-500/10 text-emerald-50`,
    settled: tw`border-emerald-400/60 bg-emerald-500/20 text-emerald-50`
  };

  const HANDOFF_STATUS_CLASS = {
    pending: tw`border-amber-300/40 bg-amber-400/10 text-amber-100`,
    ready: tw`border-emerald-300/60 bg-emerald-500/15 text-emerald-50`,
    assembled: tw`border-sky-300/50 bg-sky-500/15 text-sky-50`,
    served: tw`border-slate-500/40 bg-slate-800/70 text-slate-100`
  };

  const SERVICE_ICONS = { dine_in:'🍽️', delivery:'🚚', takeaway:'🧾', pickup:'🛍️' };

  const parseTime = (value)=>{
    if(!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  };

  const formatClock = (value, lang)=>{
    const ms = typeof value === 'number' ? value : parseTime(value);
    if(!ms) return '—';
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    return new Date(ms).toLocaleTimeString(locale, { hour:'2-digit', minute:'2-digit' });
  };

  const formatDuration = (elapsedMs)=>{
    if(!elapsedMs || elapsedMs < 0) return '00:00';
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (value)=> value < 10 ? `0${value}` : String(value);
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const sum = (list, selector)=> list.reduce((acc, item)=> acc + (Number(selector(item)) || 0), 0);

  const ensureQuantity = (value)=>{
    const num = Number(value);
    if(Number.isFinite(num) && num > 0) return num;
    return 1;
  };

  const computeOrdersSnapshot = (db)=>{
    const orders = Array.isArray(db?.data?.jobs?.orders) ? db.data.jobs.orders : [];
    const handoff = db?.data?.handoff || {};
    const stationMap = db?.data?.stationMap || {};
    return orders.map(order=>{
      const record = handoff[order.orderId] || handoff[order.id] || {};
      let totalItems = 0;
      let readyItems = 0;
      const detailRows = [];
      const jobs = Array.isArray(order.jobs) ? order.jobs : [];
      jobs.forEach(job=>{
        const jobDetails = Array.isArray(job.details) ? job.details : [];
        const station = stationMap[job.stationId] || {};
        const stationLabelAr = station.nameAr || job.stationCode || job.stationId;
        const stationLabelEn = station.nameEn || job.stationCode || job.stationId;
        if(jobDetails.length){
          jobDetails.forEach(detail=>{
            const quantity = ensureQuantity(detail.quantity);
            const detailClone = { ...detail, quantity };
            totalItems += quantity;
            if(detailClone.status === 'ready' || detailClone.status === 'completed') readyItems += quantity;
            detailRows.push({ detail: detailClone, stationLabelAr, stationLabelEn });
          });
        } else {
          const quantity = ensureQuantity(job.totalItems || job.completedItems || 1);
          const fallbackDetail = {
            id: `${job.id}-fallback`,
            itemNameAr: stationLabelAr,
            itemNameEn: stationLabelEn,
            status: job.status,
            quantity,
            prepNotes: job.notes || '',
            modifiers: []
          };
          if(job.status === 'ready' || job.status === 'completed') readyItems += quantity;
          totalItems += quantity;
          detailRows.push({ detail: fallbackDetail, stationLabelAr, stationLabelEn });
        }
      });
      if(totalItems === 0){
        totalItems = jobs.reduce((acc, job)=> acc + (Number(job.totalItems) || (Array.isArray(job.details) ? job.details.reduce((dAcc, detail)=> dAcc + ensureQuantity(detail.quantity), 0) : 0)), 0);
        readyItems = jobs.reduce((acc, job)=> acc + (Number(job.completedItems) || 0), 0);
      }
      let status = record.status;
      if(status !== 'assembled' && status !== 'served'){
        status = (totalItems > 0 && readyItems >= totalItems) ? 'ready' : 'pending';
      }
      return { ...order, handoffStatus: status, handoffRecord: record, readyItems, totalItems, detailRows };
    });
  };

  const getExpoOrders = (db)=> computeOrdersSnapshot(db)
    .filter(order=> order.handoffStatus !== 'assembled' && order.handoffStatus !== 'served');

  const getHandoffOrders = (db)=> computeOrdersSnapshot(db)
    .filter(order=> order.handoffStatus === 'assembled' && (order.serviceMode || 'dine_in') !== 'delivery');

  const cloneJob = (job)=>({
    ...job,
    details: Array.isArray(job.details) ? job.details.map(detail=>({
      ...detail,
      modifiers: Array.isArray(detail.modifiers) ? detail.modifiers.map(mod=>({ ...mod })) : []
    })) : [],
    history: Array.isArray(job.history) ? job.history.map(entry=>({ ...entry })) : []
  });

  const buildJobRecords = (jobOrders)=>{
    if(!jobOrders) return [];
    const headers = Array.isArray(jobOrders.headers) ? jobOrders.headers : [];
    const details = Array.isArray(jobOrders.details) ? jobOrders.details : [];
    const modifiers = Array.isArray(jobOrders.modifiers) ? jobOrders.modifiers : [];
    const history = Array.isArray(jobOrders.statusHistory) ? jobOrders.statusHistory : [];

    const modifiersByDetail = modifiers.reduce((acc, mod)=>{
      const bucket = acc[mod.detailId] || (acc[mod.detailId] = []);
      bucket.push({ ...mod });
      return acc;
    }, {});

    const detailsByJob = details.reduce((acc, detail)=>{
      const enriched = {
        ...detail,
        modifiers: modifiersByDetail[detail.id] ? modifiersByDetail[detail.id].map(item=>({ ...item })) : []
      };
      const bucket = acc[detail.jobOrderId] || (acc[detail.jobOrderId] = []);
      bucket.push(enriched);
      return acc;
    }, {});

    const historyByJob = history.reduce((acc, record)=>{
      const bucket = acc[record.jobOrderId] || (acc[record.jobOrderId] = []);
      bucket.push({ ...record });
      return acc;
    }, {});

    return headers.map(header=>{
      const cloned = { ...header };
      cloned.details = (detailsByJob[header.id] || []).sort((a, b)=>{
        const aMs = parseTime(a.startAt) || parseTime(a.createdAt) || 0;
        const bMs = parseTime(b.startAt) || parseTime(b.createdAt) || 0;
        return aMs - bMs;
      });
      cloned.history = (historyByJob[header.id] || []).sort((a, b)=>{
        const aMs = parseTime(a.changedAt) || 0;
        const bMs = parseTime(b.changedAt) || 0;
        return aMs - bMs;
      });
      cloned.createdMs = parseTime(cloned.createdAt);
      cloned.acceptedMs = parseTime(cloned.acceptedAt);
      cloned.startMs = parseTime(cloned.startedAt);
      cloned.readyMs = parseTime(cloned.readyAt);
      cloned.completedMs = parseTime(cloned.completedAt);
      cloned.updatedMs = parseTime(cloned.updatedAt);
      cloned.dueMs = parseTime(cloned.dueAt);
      return cloned;
    });
  };

  const indexJobs = (jobsList)=>{
    const list = Array.isArray(jobsList) ? jobsList.slice() : [];
    list.sort((a, b)=>{
      const aKey = a.acceptedMs ?? a.createdMs ?? 0;
      const bKey = b.acceptedMs ?? b.createdMs ?? 0;
      if(aKey === bKey){
        const aPriority = STATUS_PRIORITY[a.status] ?? 0;
        const bPriority = STATUS_PRIORITY[b.status] ?? 0;
        return bPriority - aPriority;
      }
      return aKey - bKey;
    });

    const byStation = {};
    const byService = {};
    const orderMap = new Map();
    const stats = { total:list.length, expedite:0, alerts:0, ready:0, pending:0 };

    list.forEach(job=>{
      const stationId = job.stationId || 'general';
      (byStation[stationId] || (byStation[stationId] = [])).push(job);
      const service = job.serviceMode || job.orderTypeId || 'dine_in';
      (byService[service] || (byService[service] = [])).push(job);
      const orderKey = job.orderId || job.orderNumber || job.id;
      if(!orderMap.has(orderKey)){
        orderMap.set(orderKey, {
          orderId: job.orderId || orderKey,
          orderNumber: job.orderNumber || orderKey,
          serviceMode: service,
          tableLabel: job.tableLabel || null,
          customerName: job.customerName || null,
          createdAt: job.createdAt || job.acceptedAt || job.startedAt,
          createdMs: job.createdMs || job.acceptedMs || job.startMs,
          jobs: []
        });
      }
      orderMap.get(orderKey).jobs.push(job);
      if(job.isExpedite) stats.expedite += 1;
      if(job.hasAlerts) stats.alerts += 1;
      if(job.status === 'ready' || job.status === 'completed') stats.ready += 1; else stats.pending += 1;
    });

    const orders = Array.from(orderMap.values()).map(order=>{
      order.jobs.sort((a, b)=>{
        if(a.stationId === b.stationId) return (a.startMs || a.acceptedMs || 0) - (b.startMs || b.acceptedMs || 0);
        return (a.stationId || '').localeCompare(b.stationId || '');
      });
      return order;
    });
    orders.sort((a, b)=> (a.createdMs || 0) - (b.createdMs || 0));

    return { list, byStation, byService, orders, stats };
  };

  const buildExpoTickets = (expoSource, jobsIndex)=>{
    const source = Array.isArray(expoSource) ? expoSource : [];
    const jobMap = new Map((jobsIndex.list || []).map(job=> [job.id, job]));
    return source.map(ticket=>{
      const jobOrderIds = Array.isArray(ticket.jobOrderIds) ? ticket.jobOrderIds : [];
      const jobs = jobOrderIds.map(id=> jobMap.get(id)).filter(Boolean);
      const readyItems = jobs.length ? sum(jobs, job=> job.completedItems || 0) : (ticket.readyItems || 0);
      const totalItems = jobs.length ? sum(jobs, job=> job.totalItems || (job.details ? job.details.length : 0)) : (ticket.totalItems || 0);
      const status = ticket.status || (totalItems > 0 && readyItems >= totalItems ? 'ready' : 'awaiting');
      return { ...ticket, jobs, readyItems, totalItems, status };
    });
  };

  const buildStations = (database, kdsSource, masterSource={})=>{
    const explicitStations = Array.isArray(kdsSource?.stations) && kdsSource.stations.length
      ? kdsSource.stations.map(station=> ({ ...station }))
      : [];
    if(explicitStations.length) return explicitStations;
    const masterStations = Array.isArray(masterSource?.stations) && masterSource.stations.length
      ? masterSource.stations.map(station=> ({ ...station }))
      : [];
    if(masterStations.length) return masterStations;
    const sectionSource = (Array.isArray(database?.kitchen_sections) && database.kitchen_sections.length)
      ? database.kitchen_sections
      : (Array.isArray(masterSource?.kitchenSections) ? masterSource.kitchenSections : []);
    return sectionSource.map((section, idx)=>{
      const id = section.id || section.section_id || section.sectionId;
      const nameAr = section.section_name?.ar || section.name?.ar || section.nameAr || id;
      const nameEn = section.section_name?.en || section.name?.en || section.nameEn || id;
      return {
        id,
        code: id && id.toString ? id.toString().toUpperCase() : id,
        nameAr,
        nameEn,
        stationType: id === 'expo' ? 'expo' : 'prep',
        isExpo: id === 'expo',
        sequence: idx + 1,
        themeColor: null,
        displayConfig: { layout:'grid', columns:2 },
        autoRouteRules: [],
        createdAt: null,
        updatedAt: null
      };
    });
  };

  const toStationMap = (list)=> (Array.isArray(list)
    ? list.reduce((acc, station)=>{
        if(station && station.id != null){
          acc[station.id] = station;
        }
        return acc;
      }, {})
    : {});

  const buildTabs = (db, t)=>{
    const tabs = [];
    const { filters, jobs } = db.data;
    const locked = filters.lockedSection;
    if(!locked){
      tabs.push({ id:'prep', label:t.tabs.prep, count: jobs.orders.length });
    }
    const stationOrder = (db.data.stations || []).slice().sort((a, b)=> (a.sequence || 0) - (b.sequence || 0));
    stationOrder.forEach(station=>{
      if(locked && station.id !== filters.activeTab) return;
      tabs.push({
        id: station.id,
        label: db.env.lang === 'ar' ? (station.nameAr || station.nameEn || station.id) : (station.nameEn || station.nameAr || station.id),
        count: (jobs.byStation[station.id] || []).length,
        color: station.themeColor || null
      });
    });
    if(!locked){
      const existingIds = new Set(tabs.map(tab=> tab.id));
      const stageTabs = [
        { id:'expo', label:t.tabs.expo, count: getExpoOrders(db).length },
        { id:'handoff', label:t.tabs.handoff, count: getHandoffOrders(db).length },
        { id:'delivery', label:t.tabs.delivery, count: getDeliveryOrders(db).length },
        { id:'delivery-pending', label:t.tabs.pendingDelivery, count: getPendingDeliveryOrders(db).length }
      ];
      stageTabs.forEach(tab=>{
        if(existingIds.has(tab.id)) return;
        existingIds.add(tab.id);
        tabs.push(tab);
      });
    }
    return tabs;
  };

  const getDeliveryOrders = (db)=>{
    const deliveriesState = db.data.deliveries || {};
    const assignments = deliveriesState.assignments || {};
    const settlements = deliveriesState.settlements || {};
    return computeOrdersSnapshot(db)
      .filter(order=> (order.serviceMode || 'dine_in') === 'delivery' && order.handoffStatus === 'assembled')
      .map(order=> ({
        ...order,
        assignment: assignments[order.orderId] || null,
        settlement: settlements[order.orderId] || null
      }));
  };

  const getPendingDeliveryOrders = (db)=> getDeliveryOrders(db)
    .filter(order=>{
      const assigned = order.assignment;
      if(!assigned || assigned.status !== 'delivered') return false;
      const settlement = order.settlement;
      if(!settlement) return true;
      return settlement.status !== 'settled';
    });

  const createBadge = (text, className)=> D.Text.Span({ attrs:{ class: cx(tw`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold`, className) } }, [text]);

  const renderEmpty = (message)=> D.Containers.Div({ attrs:{ class: tw`flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-slate-800/60 bg-slate-900/60 text-center text-slate-300` }}, [
    D.Text.Span({ attrs:{ class: tw`text-3xl` }}, ['🍽️']),
    D.Text.P({ attrs:{ class: tw`max-w-md text-sm leading-relaxed text-slate-400` }}, [message])
  ]);

  const renderHeader = (db, t)=>{
    const stats = db.data.jobs.stats || { total:0, expedite:0, alerts:0, ready:0, pending:0 };
    const lang = db.env.lang || 'ar';
    const theme = db.env.theme || 'dark';
    const now = db.data.now || Date.now();
    const statusState = db.data.sync?.state || 'online';
    const statusLabel = t.status[statusState] || t.status.online;
    const themeButtonClass = (mode)=> cx(
      tw`rounded-full px-2 py-1 text-xs font-semibold transition`,
      theme === mode
        ? tw`border border-sky-400/60 bg-sky-500/20 text-sky-100`
        : tw`border border-transparent text-slate-300 hover:text-slate-100`
    );
    const langButtonClass = (value)=> cx(
      tw`rounded-full px-2 py-1 text-xs font-semibold transition`,
      lang === value
        ? tw`border border-emerald-400/60 bg-emerald-500/20 text-emerald-100`
        : tw`border border-transparent text-slate-300 hover:text-slate-100`
    );
    return D.Containers.Header({ attrs:{ class: tw`px-6 pt-6 pb-4` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-5 rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/40 backdrop-blur` }}, [
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between` }}, [
          D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1` }}, [
            D.Text.H1({ attrs:{ class: tw`text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl` }}, [t.title]),
            D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [t.subtitle])
          ]),
          D.Containers.Div({ attrs:{ class: tw`flex flex-wrap items-center gap-3` }}, [
            createBadge(statusLabel, tw`border-sky-400/40 bg-sky-500/10 text-sky-100`),
            createBadge(formatClock(now, lang), tw`border-slate-500/40 bg-slate-800/60 text-slate-100`),
            createBadge(`${t.stats.total}: ${stats.total}`, tw`border-slate-600/40 bg-slate-800/70 text-slate-100`),
            D.Containers.Div({ attrs:{ class: tw`flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1` }}, [
              D.Text.Span({ attrs:{ class: tw`text-xs text-slate-400` }}, [t.controls.theme]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:theme:set', 'data-theme':'light', class: themeButtonClass('light') }}, [t.controls.light]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:theme:set', 'data-theme':'dark', class: themeButtonClass('dark') }}, [t.controls.dark])
            ]),
            D.Containers.Div({ attrs:{ class: tw`flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1` }}, [
              D.Text.Span({ attrs:{ class: tw`text-xs text-slate-400` }}, [t.controls.language]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:lang:set', 'data-lang':'ar', class: langButtonClass('ar') }}, [t.controls.arabic]),
              D.Forms.Button({ attrs:{ type:'button', gkey:'kds:lang:set', 'data-lang':'en', class: langButtonClass('en') }}, [t.controls.english])
            ])
          ])
        ]),
        D.Containers.Div({ attrs:{ class: tw`grid gap-3 sm:grid-cols-2 xl:grid-cols-4` }}, [
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.expedite]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-sky-200` }}, [String(stats.expedite || 0)])
          ]),
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.alerts]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-amber-200` }}, [String(stats.alerts || 0)])
          ]),
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.ready]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-emerald-200` }}, [String(stats.ready || 0)])
          ]),
          D.Containers.Div({ attrs:{ class: tw`rounded-2xl border border-slate-800/50 bg-slate-900/70 p-4` }}, [
            D.Text.Span({ attrs:{ class: tw`text-xs uppercase tracking-wide text-slate-400` }}, [t.stats.pending]),
            D.Text.Span({ attrs:{ class: tw`mt-1 text-2xl font-bold text-slate-200` }}, [String(stats.pending || 0)])
          ])
        ])
      ])
    ]);
  };

  const renderTabs = (db, t)=>{
    const tabs = buildTabs(db, t);
    const active = db.data.filters.activeTab;
    if(!tabs.length) return null;
    return D.Containers.Nav({ attrs:{ class: tw`mb-3 flex flex-wrap gap-2` }}, [
      ...tabs.map(tab=> D.Forms.Button({
        attrs:{
          type:'button',
          gkey:'kds:tab:switch',
          'data-section-id': tab.id,
          class: cx(
            tw`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition`,
            tab.id === active
              ? tw`border-sky-400/60 bg-sky-500/20 text-sky-50 shadow-lg shadow-sky-900/40`
              : tw`border-slate-700/70 bg-slate-900/60 text-slate-300 hover:text-slate-100`
          )
        }
      }, [
        D.Text.Span(null, [tab.label]),
        typeof tab.count === 'number' ? D.Text.Span({ attrs:{ class: tw`inline-flex min-w-[1.75rem] justify-center rounded-full bg-slate-800/70 px-1.5 py-0.5 text-xs font-bold text-slate-200` }}, [String(tab.count)]) : null
      ].filter(Boolean)))
    ]);
  };

  const renderJobBadges = (job, t, lang)=>{
    const badges = [];
    const service = job.serviceMode || job.orderTypeId || 'dine_in';
    const serviceLabel = t.labels.serviceMode[service] || service;
    badges.push(createBadge(`${SERVICE_ICONS[service] || '🧾'} ${serviceLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    if(job.tableLabel) badges.push(createBadge(`${t.labels.table} ${job.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    if(job.customerName && !job.tableLabel) badges.push(createBadge(`${t.labels.customer}: ${job.customerName}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    if(job.isExpedite) badges.push(createBadge('⚡ expedite', tw`border-amber-300/50 bg-amber-500/20 text-amber-50`));
    if(job.hasAlerts) badges.push(createBadge('🚨 alert', tw`border-rose-400/60 bg-rose-500/20 text-rose-100`));
    if(job.dueAt) badges.push(createBadge(`${t.labels.due}: ${formatClock(job.dueAt, lang)}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
    return badges;
  };

  const renderDetailRow = (detail, t, lang, stationLabel)=>{
    const statusLabel = t.labels.jobStatus[detail.status] || detail.status;
    const stationText = lang === 'ar' ? t.labels.station.ar : t.labels.station.en;
    return D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.Strong({ attrs:{ class: tw`text-sm text-slate-100` }}, [`${detail.quantity}× ${lang === 'ar' ? (detail.itemNameAr || detail.itemNameEn || detail.itemId) : (detail.itemNameEn || detail.itemNameAr || detail.itemId)}`]),
        createBadge(statusLabel, STATUS_CLASS[detail.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      stationLabel ? createBadge(`${stationText}: ${stationLabel}`, tw`border-slate-600/40 bg-slate-800/70 text-slate-100`) : null,
      detail.prepNotes ? D.Text.P({ attrs:{ class: tw`text-xs text-slate-300` }}, [`📝 ${detail.prepNotes}`]) : null,
      detail.modifiers && detail.modifiers.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, detail.modifiers.map(mod=>{
        const typeText = mod.modifierType === 'remove'
          ? (lang === 'ar' ? 'بدون' : 'No')
          : mod.modifierType === 'add'
            ? (lang === 'ar' ? 'إضافة' : 'Add')
            : mod.modifierType;
        return D.Text.Span({ attrs:{ class: tw`inline-flex items-center rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-100` }}, [`${typeText}: ${lang === 'ar' ? (mod.nameAr || mod.nameEn) : (mod.nameEn || mod.nameAr)}`]);
      })) : null
    ].filter(Boolean));
  };

  const renderHistory = (job, t, lang)=>{
    if(!job.history || !job.history.length) return null;
    const lastEntries = job.history.slice(-2);
    const heading = lang === 'ar' ? '⏱️ آخر الحالات' : '⏱️ Recent updates';
    return D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
      D.Text.Span({ attrs:{ class: tw`text-xs font-semibold uppercase tracking-wide text-slate-400` }}, [heading]),
      ...lastEntries.map(entry=> D.Text.Span({ attrs:{ class: tw`text-xs text-slate-300` }}, [`${formatClock(entry.changedAt, lang)} · ${t.labels.jobStatus[entry.status] || entry.status}${entry.actorName ? ` — ${entry.actorName}` : ''}`]))
    ]);
  };

  const startJob = (job, nowIso, nowMs)=>{
    if(job.status === 'ready' || job.status === 'completed') return {
      ...job,
      startedAt: job.startedAt || nowIso,
      startMs: job.startMs || nowMs,
      updatedAt: nowIso,
      updatedMs: nowMs
    };
    const details = job.details.map(detail=>{
      if(detail.status === 'ready' || detail.status === 'completed') return detail;
      return {
        ...detail,
        status: 'in_progress',
        startAt: detail.startAt || nowIso,
        updatedAt: nowIso
      };
    });
    const remaining = details.filter(detail=> detail.status !== 'ready' && detail.status !== 'completed').length;
    const completed = details.length - remaining;
    return {
      ...job,
      status: 'in_progress',
      progressState: 'cooking',
      acceptedAt: job.acceptedAt || nowIso,
      acceptedMs: job.acceptedMs || nowMs,
      startedAt: job.startedAt || nowIso,
      startMs: job.startMs || nowMs,
      updatedAt: nowIso,
      updatedMs: nowMs,
      remainingItems: remaining,
      completedItems: completed,
      details,
      history: job.history.concat([{ id:`HIS-${job.id}-${nowMs}`, jobOrderId: job.id, status:'in_progress', actorId:'kds-station', actorName:'KDS Station', actorRole:'station', changedAt: nowIso, meta:{ source:'kds' } }])
    };
  };

  const finishJob = (job, nowIso, nowMs)=>{
    const details = job.details.map(detail=> ({
      ...detail,
      status: 'ready',
      finishAt: detail.finishAt || nowIso,
      updatedAt: nowIso
    }));
    return {
      ...job,
      status: 'ready',
      progressState: 'completed',
      readyAt: job.readyAt || nowIso,
      readyMs: job.readyMs || nowMs,
      completedAt: job.completedAt || nowIso,
      completedMs: job.completedMs || nowMs,
      updatedAt: nowIso,
      updatedMs: nowMs,
      remainingItems: 0,
      completedItems: job.totalItems || details.length,
      details,
      history: job.history.concat([{ id:`HIS-${job.id}-ready-${nowMs}`, jobOrderId: job.id, status:'ready', actorId:'kds-station', actorName:'KDS Station', actorRole:'station', changedAt: nowIso, meta:{ source:'kds' } }])
    };
  };

  const applyJobsUpdate = (state, transform)=>{
    const list = state.data.jobs.list.map(cloneJob);
    const nextList = transform(list) || list;
    const jobs = indexJobs(nextList);
    const expoTickets = buildExpoTickets(state.data.expoSource, jobs);
    return {
      ...state,
      data:{
        ...state.data,
        jobs,
        expoTickets
      }
    };
  };

  const renderJobCard = (job, station, t, lang, now)=>{
    const statusLabel = t.labels.jobStatus[job.status] || job.status;
    const elapsed = job.startMs ? now - job.startMs : 0;
    const duration = job.startMs ? formatDuration(elapsed) : '00:00';
    const stationColor = station?.themeColor || '#38bdf8';
    const headerBadges = renderJobBadges(job, t, lang);
    return D.Containers.Article({ attrs:{ class: tw`relative flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`absolute inset-y-0 end-0 w-1 rounded-e-3xl`, style:`background: ${stationColor}; opacity:0.35;` }}, []),
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${job.orderNumber || job.orderId}`]),
        createBadge(statusLabel, STATUS_CLASS[job.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
      D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
        D.Text.Span(null, [`${t.labels.timer}: ${duration}`]),
        D.Text.Span(null, [`${t.labels.due}: ${formatClock(job.dueAt || job.readyAt || job.completedAt || job.startedAt, lang)}`]),
        D.Text.Span(null, [`${t.stats.pending}: ${job.remainingItems ?? Math.max(0, (job.totalItems || job.details.length) - (job.completedItems || 0))}`]),
        D.Text.Span(null, [`${t.stats.ready}: ${job.completedItems || 0}`])
      ]),
      job.notes ? D.Text.P({ attrs:{ class: tw`text-sm text-amber-200` }}, [`🧾 ${job.notes}`]) : null,
      job.details && job.details.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, job.details.map(detail=> renderDetailRow(detail, t, lang))) : null,
      renderHistory(job, t, lang),
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2 pt-2` }}, [
        job.status !== 'ready' && job.status !== 'completed'
        ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:job:start', 'data-job-id':job.id, class: tw`flex-1 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-900/50 transition hover:bg-sky-400` }}, [t.actions.start])
          : null,
        job.status !== 'ready'
        ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:job:finish', 'data-job-id':job.id, class: tw`flex-1 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20` }}, [t.actions.finish])
          : createBadge(t.labels.jobStatus.ready, STATUS_CLASS.ready)
      ].filter(Boolean))
    ].filter(Boolean));
  };

  const renderPrepPanel = (db, t, lang, now)=>{
    const orders = db.data.jobs.orders || [];
    if(!orders.length) return renderEmpty(t.empty.prep);
    const stationMap = db.data.stationMap || {};
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=> D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber}`]),
        createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${t.labels.serviceMode[order.serviceMode] || order.serviceMode}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`)
      ]),
      order.tableLabel ? createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`) : null,
      order.customerName ? D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [`${t.labels.customer}: ${order.customerName}`]) : null,
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.jobs.map(job=> D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3` }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-center justify-between gap-3` }}, [
          D.Text.Span({ attrs:{ class: tw`text-sm font-semibold text-slate-100` }}, [stationMap[job.stationId] ? (lang === 'ar' ? (stationMap[job.stationId].nameAr || stationMap[job.stationId].nameEn) : (stationMap[job.stationId].nameEn || stationMap[job.stationId].nameAr)) : job.stationCode || job.stationId]),
          createBadge(t.labels.jobStatus[job.status] || job.status, STATUS_CLASS[job.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        D.Text.Span({ attrs:{ class: tw`text-xs text-slate-400` }}, [`${t.labels.timer}: ${job.startMs ? formatDuration(now - job.startMs) : '00:00'}`])
      ])))
    ].filter(Boolean))));
  };

  const renderStationPanel = (db, stationId, t, lang, now)=>{
    const jobs = db.data.jobs.byStation[stationId] || [];
    const station = db.data.stationMap?.[stationId];
    if(!jobs.length) return renderEmpty(t.empty.station);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, jobs.map(job=> renderJobCard(job, station, t, lang, now)));
  };

  const renderExpoPanel = (db, t, lang, now)=>{
    const orders = getExpoOrders(db);
    if(!orders.length) return renderEmpty(t.empty.expo);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=>{
      const serviceLabel = t.labels.serviceMode[order.serviceMode] || order.serviceMode;
      const statusLabel = t.labels.handoffStatus[order.handoffStatus] || order.handoffStatus;
      const highlight = order.handoffStatus === 'ready';
      const headerBadges = [];
      headerBadges.push(createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${serviceLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      if(order.tableLabel) headerBadges.push(createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      if(order.customerName && !order.tableLabel) headerBadges.push(createBadge(`${t.labels.customer}: ${order.customerName}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      const startedMs = (order.jobs || []).reduce((min, job)=>{
        const candidate = job.startMs || job.acceptedMs || job.createdMs;
        if(candidate && (min === null || candidate < min)) return candidate;
        return min;
      }, null);
      const elapsed = startedMs ? now - startedMs : 0;
      const cardClass = cx(
        tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40`,
        highlight ? tw`border-emerald-300/70 bg-emerald-500/10 text-emerald-50 animate-pulse` : null
      );
      const actionSection = highlight
        ? D.Forms.Button({
            attrs:{
              type:'button',
              gkey:'kds:handoff:assembled',
              'data-order-id': order.orderId,
              class: tw`w-full rounded-full border border-emerald-400/70 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-lg shadow-emerald-900/30 hover:bg-emerald-500/30`
            }
          }, [t.actions.handoffComplete])
        : createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`);
      return D.Containers.Article({ attrs:{ class: cardClass }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber || order.orderId}`]),
          createBadge(statusLabel, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
        ]),
        headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
        D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
          D.Text.Span(null, [`${t.stats.ready}: ${order.readyItems || 0} / ${order.totalItems || 0}`]),
          D.Text.Span(null, [`${t.labels.timer}: ${formatDuration(elapsed)}`])
        ]),
        order.detailRows && order.detailRows.length
          ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
              const stationLabel = lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn;
              return renderDetailRow(entry.detail, t, lang, stationLabel);
            }))
          : null,
        actionSection
      ].filter(Boolean));
    }));
  };

  const renderDeliveryCard = (order, t, lang, options={})=>{
    const assignment = order.assignment || null;
    const settlement = order.settlement || null;
    const statusKey = settlement?.status === 'settled' ? 'settled' : (assignment?.status || 'pending');
    const statusLabel = t.labels.deliveryStatus[statusKey] || statusKey;
    const driverName = assignment?.driverName || t.labels.notAssigned;
    const driverPhone = assignment?.driverPhone || '—';
    return D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
      D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
        D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber}`]),
        createBadge(statusLabel, DELIVERY_STATUS_CLASS[statusKey] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`)
      ]),
      order.handoffStatus ? createBadge(t.labels.handoffStatus[order.handoffStatus] || order.handoffStatus, HANDOFF_STATUS_CLASS[order.handoffStatus] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`) : null,
      order.tableLabel ? D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [`${t.labels.table}: ${order.tableLabel}`]) : null,
      D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-sm text-slate-300` }}, [
        D.Text.Span(null, [`${t.labels.driver}: ${driverName}`]),
        D.Text.Span(null, [`${t.labels.driverPhone}: ${driverPhone}`]),
        assignment?.vehicleId ? D.Text.Span(null, [`🚗 ${assignment.vehicleId}`]) : null
      ].filter(Boolean)),
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, order.jobs.map(job=> createBadge(`${job.stationCode || job.stationId}: ${t.labels.jobStatus[job.status] || job.status}`, STATUS_CLASS[job.status] || tw`border-slate-600/40 bg-slate-800/70 text-slate-100`))),
      D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2 pt-2` }}, [
        D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:assign', 'data-order-id':order.orderId, class: tw`flex-1 rounded-full border border-sky-400/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20` }}, [t.actions.assignDriver]),
        statusKey !== 'delivered' && statusKey !== 'settled'
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:complete', 'data-order-id':order.orderId, class: tw`flex-1 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20` }}, [t.actions.delivered])
          : null,
        statusKey === 'delivered' || options.focusSettlement
          ? D.Forms.Button({ attrs:{ type:'button', gkey:'kds:delivery:settle', 'data-order-id':order.orderId, class: tw`flex-1 rounded-full border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20` }}, [t.actions.settle])
          : null
      ].filter(Boolean))
    ].filter(Boolean));
  };

  const renderDeliveryPanel = (db, t, lang)=>{
    const orders = getDeliveryOrders(db);
    if(!orders.length) return renderEmpty(t.empty.delivery);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2` }}, orders.map(order=> renderDeliveryCard(order, t, lang)));
  };

  const renderHandoffPanel = (db, t, lang)=>{
    const orders = getHandoffOrders(db);
    if(!orders.length) return renderEmpty(t.empty.handoff);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2 xl:grid-cols-3` }}, orders.map(order=>{
      const serviceLabel = t.labels.serviceMode[order.serviceMode] || order.serviceMode;
      const headerBadges = [
        createBadge(`${SERVICE_ICONS[order.serviceMode] || '🧾'} ${serviceLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`)
      ];
      if(order.tableLabel) headerBadges.push(createBadge(`${t.labels.table} ${order.tableLabel}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      if(order.customerName && !order.tableLabel) headerBadges.push(createBadge(`${t.labels.customer}: ${order.customerName}`, tw`border-slate-500/40 bg-slate-800/60 text-slate-100`));
      return D.Containers.Article({ attrs:{ class: tw`flex flex-col gap-4 rounded-3xl border border-slate-800/60 bg-slate-950/80 p-5 shadow-xl shadow-slate-950/40` }}, [
        D.Containers.Div({ attrs:{ class: tw`flex items-start justify-between gap-3` }}, [
          D.Text.H3({ attrs:{ class: tw`text-lg font-semibold text-slate-50` }}, [`${t.labels.order} ${order.orderNumber || order.orderId}`]),
          createBadge(t.labels.handoffStatus.assembled || t.labels.handoffStatus.ready, HANDOFF_STATUS_CLASS.assembled)
        ]),
        headerBadges.length ? D.Containers.Div({ attrs:{ class: tw`flex flex-wrap gap-2` }}, headerBadges) : null,
        D.Containers.Div({ attrs:{ class: tw`grid gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3 text-xs text-slate-300 sm:grid-cols-2` }}, [
          D.Text.Span(null, [`${t.stats.ready}: ${order.readyItems || 0} / ${order.totalItems || 0}`]),
          D.Text.Span(null, [`${t.labels.timer}: ${formatClock(order.handoffRecord?.assembledAt || order.createdAt, lang)}`])
        ]),
        order.detailRows && order.detailRows.length
          ? D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, order.detailRows.map(entry=>{
              const stationLabel = lang === 'ar' ? entry.stationLabelAr : entry.stationLabelEn;
              return renderDetailRow(entry.detail, t, lang, stationLabel);
            }))
          : null,
        D.Forms.Button({
          attrs:{
            type:'button',
            gkey:'kds:handoff:served',
            'data-order-id': order.orderId,
            class: tw`w-full rounded-full border border-sky-400/70 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30`
          }
        }, [t.actions.handoffServe])
      ].filter(Boolean));
    }));
  };

  const renderPendingDeliveryPanel = (db, t, lang)=>{
    const orders = getPendingDeliveryOrders(db);
    if(!orders.length) return renderEmpty(t.empty.pending);
    return D.Containers.Section({ attrs:{ class: tw`grid gap-4 lg:grid-cols-2` }}, orders.map(order=> renderDeliveryCard(order, t, lang, { focusSettlement:true })));
  };

  const DriverModal = (db, t, lang)=>{
    const open = db.ui?.modals?.driver || false;
    if(!open) return null;
    const assignment = db.ui?.deliveryAssignment || {};
    const orderId = assignment.orderId;
    const drivers = Array.isArray(db.data.drivers) ? db.data.drivers : [];
    const order = (db.data.jobs.orders || []).find(o=> o.orderId === orderId);
    const subtitle = order ? `${t.labels.order} ${order.orderNumber}` : '';
    return UI.Modal({
      open,
      title: t.modal.driverTitle,
      description: subtitle || t.modal.driverDescription,
      content: D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-3` }}, [
        D.Text.P({ attrs:{ class: tw`text-sm text-slate-300` }}, [t.modal.driverDescription]),
        D.Containers.Div({ attrs:{ class: tw`flex flex-col gap-2` }}, drivers.map(driver=> D.Forms.Button({ attrs:{
          type:'button',
          gkey:'kds:delivery:select-driver',
          'data-order-id': orderId,
          'data-driver-id': String(driver.id),
          class: tw`flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-start text-sm text-slate-100 hover:border-sky-400/60 hover:bg-sky-500/10`
        }}, [
          D.Containers.Div({ attrs:{ class: tw`flex flex-col` }}, [
            D.Text.Strong({ attrs:{ class: tw`text-sm` }}, [driver.name || driver.id]),
            driver.phone ? D.Text.Span({ attrs:{ class: tw`text-xs text-slate-300` }}, [driver.phone]) : null
          ].filter(Boolean)),
          D.Text.Span({ attrs:{ class: tw`text-base` }}, ['🚚'])
        ])))
      ]),
      actions:[
        {
          label: t.modal.close,
          gkey:'ui:modal:close',
          variant:'secondary'
        }
      ]
    });
  };

  const renderActivePanel = (db, t, lang, now)=>{
    const active = db.data.filters.activeTab;
    if(active === 'prep') return renderPrepPanel(db, t, lang, now);
    if(active === 'expo') return renderExpoPanel(db, t, lang, now);
    if(active === 'handoff') return renderHandoffPanel(db, t, lang);
    if(active === 'delivery') return renderDeliveryPanel(db, t, lang);
    if(active === 'delivery-pending') return renderPendingDeliveryPanel(db, t, lang);
    return renderStationPanel(db, active, t, lang, now);
  };

  const AppView = (db)=>{
    const lang = db.env.lang || 'ar';
    const t = getTexts(db);
    const now = db.data.now || Date.now();
    return UI.AppRoot({
      shell: D.Containers.Div({ attrs:{ class: tw`flex min-h-screen w-full flex-col bg-slate-950/95 text-slate-100` }}, [
        renderHeader(db, t),
        D.Containers.Main({ attrs:{ class: tw`flex-1 min-h-0 w-full px-6 pb-6` }}, [
          db.data.filters.lockedSection ? null : renderTabs(db, t),
          renderActivePanel(db, t, lang, now)
        ].filter(Boolean))
      ]),
      overlays:[ DriverModal(db, t, lang) ].filter(Boolean)
    });
  };

  Mishkah.app.setBody(AppView);

  const database = typeof window !== 'undefined' ? (window.database || {}) : {};
  const kdsSource = database.kds || {};
  const masterSource = typeof kdsSource.master === 'object' && kdsSource.master ? kdsSource.master : {};
  const settings = typeof database.settings === 'object' && database.settings ? database.settings : {};
  const syncSettings = typeof settings.sync === 'object' && settings.sync ? settings.sync : {};
  const branchSettings = typeof settings.branch === 'object' && settings.branch ? settings.branch : {};
  const branchChannelSource = syncSettings.channel
    || syncSettings.branch_channel
    || syncSettings.branchChannel
    || kdsSource?.sync?.channel
    || masterSource?.sync?.channel
    || masterSource?.channel
    || branchSettings.channel
    || branchSettings.branchChannel
    || database.branch?.channel
    || database.branchChannel
    || 'branch-main';
  const BRANCH_CHANNEL = normalizeChannelName(branchChannelSource, 'branch-main');
  if(typeof window !== 'undefined'){
    window.MishkahKdsChannel = BRANCH_CHANNEL;
  }
  const stations = buildStations(database, kdsSource, masterSource);
  const stationMap = toStationMap(stations);
  const initialStationRoutes = Array.isArray(kdsSource.stationCategoryRoutes)
    ? kdsSource.stationCategoryRoutes.map(route=> ({ ...route }))
    : (Array.isArray(masterSource?.stationCategoryRoutes)
      ? masterSource.stationCategoryRoutes.map(route=> ({ ...route }))
      : (Array.isArray(database?.station_category_routes)
        ? database.station_category_routes.map(route=> ({ ...route }))
        : []));
  const initialKitchenSections = Array.isArray(kdsSource.kitchenSections)
    ? kdsSource.kitchenSections.map(section=> ({ ...section }))
    : (Array.isArray(masterSource?.kitchenSections)
      ? masterSource.kitchenSections.map(section=> ({ ...section }))
      : (Array.isArray(database?.kitchen_sections)
        ? database.kitchen_sections.map(section=> ({ ...section }))
        : []));
  const initialCategorySections = Array.isArray(kdsSource.categorySections)
    ? kdsSource.categorySections.map(entry=> ({ ...entry }))
    : (Array.isArray(masterSource?.categorySections)
      ? masterSource.categorySections.map(entry=> ({ ...entry }))
      : (Array.isArray(database?.category_sections)
        ? database.category_sections.map(entry=> ({ ...entry }))
        : []));
  const initialMenuCategories = Array.isArray(kdsSource.menu?.categories)
    ? kdsSource.menu.categories.map(category=> ({ ...category }))
    : (Array.isArray(masterSource?.categories)
      ? masterSource.categories.map(category=> ({ ...category }))
      : (Array.isArray(masterSource?.menu?.categories)
        ? masterSource.menu.categories.map(category=> ({ ...category }))
        : (Array.isArray(database?.menu?.categories)
          ? database.menu.categories.map(category=> ({ ...category }))
          : [])));
  const initialMenuItems = Array.isArray(kdsSource.menu?.items)
    ? kdsSource.menu.items.map(item=> ({ ...item }))
    : (Array.isArray(masterSource?.items)
      ? masterSource.items.map(item=> ({ ...item }))
      : (Array.isArray(masterSource?.menu?.items)
        ? masterSource.menu.items.map(item=> ({ ...item }))
        : (Array.isArray(database?.menu?.items)
          ? database.menu.items.map(item=> ({ ...item }))
          : [])));
  const initialMenu = {
    categories: initialMenuCategories,
    items: initialMenuItems
  };
  const rawJobOrders = cloneDeep(kdsSource.jobOrders || {});
  const jobRecords = buildJobRecords(rawJobOrders);
  const jobsIndexed = indexJobs(jobRecords);
  const expoSource = Array.isArray(rawJobOrders.expoPassTickets) ? rawJobOrders.expoPassTickets.map(ticket=>({ ...ticket })) : [];
  const expoTickets = buildExpoTickets(expoSource, jobsIndexed);

  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sectionParam = urlParams.get('section_id');
  const lockedSection = !!sectionParam;
  const firstStationId = stations.length ? stations[0].id : 'prep';
  const defaultTab = lockedSection ? (stationMap[sectionParam] ? sectionParam : firstStationId) : 'prep';

  const initialState = {
    head:{ title: TEXT_DICT.title.ar },
    env:{ theme:'dark', lang:'ar', dir:'rtl' },
    i18n:{ dict: TEXT_FLAT, fallback:'ar' },
    data:{
      meta:{
        ...(typeof masterSource.metadata === 'object' && masterSource.metadata ? masterSource.metadata : {}),
        ...(typeof kdsSource.metadata === 'object' && kdsSource.metadata ? kdsSource.metadata : {})
      },
      sync:{
        ...(typeof masterSource.sync === 'object' && masterSource.sync ? masterSource.sync : {}),
        ...(typeof kdsSource.sync === 'object' && kdsSource.sync ? kdsSource.sync : {}),
        state:'online',
        lastMessage:null,
        channel: BRANCH_CHANNEL
      },
      stations,
      stationMap,
      jobs: jobsIndexed,
      expoSource,
      expoTickets,
      jobOrders: rawJobOrders,
      stationCategoryRoutes: initialStationRoutes,
      kitchenSections: initialKitchenSections,
      categorySections: initialCategorySections,
      menu: initialMenu,
      filters:{ activeTab: defaultTab, lockedSection },
      deliveries:{ assignments:{}, settlements:{} },
      handoff:{},
      drivers: Array.isArray(database.drivers)
        ? database.drivers.map(driver=>({ ...driver }))
        : (Array.isArray(masterSource?.drivers) ? masterSource.drivers.map(driver=> ({ ...driver })) : []),
      now: Date.now()
    },
    ui:{
      modals:{ driver:false },
      modalOpen:false,
      deliveryAssignment:null
    }
  };

  const app = M.app.createApp(initialState, {});
  const auto = U.twcss.auto(initialState, app, { pageScaffold:true });

  const wsEndpoint = kdsSource?.sync?.endpoint || database?.kds?.endpoint || database?.sync?.endpoint || 'wss://ws.mas.com.eg/ws';
  const wsToken = kdsSource?.sync?.token || database?.kds?.token || null;
  const syncClient = createKitchenSync(app, { endpoint: wsEndpoint, token: wsToken, channel: BRANCH_CHANNEL });
  if(syncClient){
    syncClient.connect();
  }

  let broadcastChannel = null;
  if(typeof BroadcastChannel !== 'undefined'){
    try{
      broadcastChannel = new BroadcastChannel('mishkah-pos-kds-sync');
      broadcastChannel.onmessage = (event)=>{
        const msg = event?.data;
        if(!msg || !msg.type || msg.origin === 'kds') return;
        const meta = msg.meta || {};
        if(msg.type === 'orders:payload' && msg.payload){
          applyRemoteOrder(app, msg.payload, meta);
          return;
        }
        if(msg.type === 'job:update' && msg.jobId){
          applyJobUpdateMessage(app, { jobId: msg.jobId, payload: msg.payload || {} }, meta);
        }
        if(msg.type === 'delivery:update' && msg.orderId){
          applyDeliveryUpdateMessage(app, { orderId: msg.orderId, payload: msg.payload || {} }, meta);
        }
        if(msg.type === 'handoff:update' && msg.orderId){
          applyHandoffUpdateMessage(app, { orderId: msg.orderId, payload: msg.payload || {} }, meta);
        }
      };
    } catch(_err) {
      broadcastChannel = null;
    }
  }

  const emitSync = (message)=>{
    if(!broadcastChannel || !message) return;
    const payload = { origin:'kds', ...message };
    try{ broadcastChannel.postMessage(payload); } catch(_err){}
  };

  const mergeJobOrders = (current={}, patch={})=>{
    const mergeList = (base=[], updates=[], key='id')=>{
      const map = new Map();
      base.forEach(item=>{
        if(!item || item[key] == null) return;
        map.set(String(item[key]), { ...item });
      });
      updates.forEach(item=>{
        if(!item || item[key] == null) return;
        const id = String(item[key]);
        map.set(id, Object.assign({}, map.get(id) || {}, item));
      });
      return Array.from(map.values());
    };
    return {
      headers: mergeList(Array.isArray(current.headers) ? current.headers : [], Array.isArray(patch.headers) ? patch.headers : []),
      details: mergeList(Array.isArray(current.details) ? current.details : [], Array.isArray(patch.details) ? patch.details : []),
      modifiers: mergeList(Array.isArray(current.modifiers) ? current.modifiers : [], Array.isArray(patch.modifiers) ? patch.modifiers : []),
      statusHistory: mergeList(Array.isArray(current.statusHistory) ? current.statusHistory : [], Array.isArray(patch.statusHistory) ? patch.statusHistory : [])
    };
  };

  const applyJobUpdateMessage = (appInstance, data={}, meta={})=>{
    const jobId = data.jobId || data.id;
    const patch = data.payload && typeof data.payload === 'object' ? data.payload : {};
    if(!jobId || !Object.keys(patch).length) return;
    const now = Date.now();
    appInstance.setState(state=>{
      const baseNext = applyJobsUpdate(state, list=> list.map(job=>{
        if(job.id !== jobId) return job;
        const updated = { ...job, ...patch };
        if(patch.startedAt){
          updated.startedAt = patch.startedAt;
          updated.startMs = parseTime(patch.startedAt) || updated.startMs;
        }
        if(patch.readyAt){
          updated.readyAt = patch.readyAt;
          updated.readyMs = parseTime(patch.readyAt) || updated.readyMs;
        }
        if(patch.completedAt){
          updated.completedAt = patch.completedAt;
          updated.completedMs = parseTime(patch.completedAt) || updated.completedMs;
        }
        if(patch.updatedAt){
          updated.updatedAt = patch.updatedAt;
          updated.updatedMs = parseTime(patch.updatedAt) || updated.updatedMs;
        }
        return updated;
      }));
      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          sync
        }
      };
    });
  };

  const applyDeliveryUpdateMessage = (appInstance, data={}, meta={})=>{
    const orderId = data.orderId || data.id;
    const patch = data.payload && typeof data.payload === 'object' ? data.payload : {};
    if(!orderId || !Object.keys(patch).length) return;
    const now = Date.now();
    appInstance.setState(state=>{
      const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
      const assignments = { ...(deliveries.assignments || {}) };
      const settlements = { ...(deliveries.settlements || {}) };
      if(patch.assignment){
        assignments[orderId] = { ...(assignments[orderId] || {}), ...patch.assignment };
      }
      if(patch.settlement){
        settlements[orderId] = { ...(settlements[orderId] || {}), ...patch.settlement };
      }
      const baseNext = {
        ...state,
        data:{
          ...state.data,
          deliveries:{ assignments, settlements }
        }
      };
      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          sync
        }
      };
    });
  };

  const applyHandoffUpdateMessage = (appInstance, data={}, meta={})=>{
    const orderId = data.orderId || data.id;
    const patch = data.payload && typeof data.payload === 'object' ? data.payload : {};
    if(!orderId || !Object.keys(patch).length) return;
    const now = Date.now();
    appInstance.setState(state=>{
      const handoff = state.data.handoff || {};
      const next = { ...handoff, [orderId]: { ...(handoff[orderId] || {}), ...patch } };
      const baseNext = {
        ...state,
        data:{
          ...state.data,
          handoff: next
        }
      };
      const syncBase = baseNext.data?.sync || state.data?.sync || {};
      const sync = { ...syncBase, lastMessage: now, state:'online' };
      if(meta && meta.channel) sync.channel = meta.channel;
      return {
        ...baseNext,
        data:{
          ...baseNext.data,
          sync
        }
      };
    });
  };

  const applyRemoteOrder = (appInstance, payload={}, meta={})=>{
    if(!payload || !payload.jobOrders) return;
    appInstance.setState(state=>{
      const mergedOrders = mergeJobOrders(state.data.jobOrders || {}, payload.jobOrders);
      const jobRecordsNext = buildJobRecords(mergedOrders);
      const jobsIndexedNext = indexJobs(jobRecordsNext);
      const expoSourcePatch = Array.isArray(payload.jobOrders?.expoPassTickets)
        ? payload.jobOrders.expoPassTickets.map(ticket=> ({ ...ticket }))
        : state.data.expoSource;
      const expoSourceNext = Array.isArray(expoSourcePatch) ? expoSourcePatch : [];
      const expoTicketsNext = buildExpoTickets(expoSourceNext, jobsIndexedNext);
      let deliveriesNext = state.data.deliveries || { assignments:{}, settlements:{} };
      if(payload.deliveries){
        const assignments = { ...(deliveriesNext.assignments || {}) };
        const settlements = { ...(deliveriesNext.settlements || {}) };
        if(payload.deliveries.assignments){
          Object.keys(payload.deliveries.assignments).forEach(orderId=>{
            assignments[orderId] = { ...(assignments[orderId] || {}), ...payload.deliveries.assignments[orderId] };
          });
        }
        if(payload.deliveries.settlements){
          Object.keys(payload.deliveries.settlements).forEach(orderId=>{
            settlements[orderId] = { ...(settlements[orderId] || {}), ...payload.deliveries.settlements[orderId] };
          });
        }
        deliveriesNext = { assignments, settlements };
      }
      let driversNext = state.data.drivers;
      if(Array.isArray(payload.drivers)){
        const existing = Array.isArray(state.data.drivers) ? state.data.drivers : [];
        const map = new Map(existing.map(driver=> [String(driver.id), driver]));
        payload.drivers.forEach(driver=>{
          if(driver && driver.id != null) map.set(String(driver.id), driver);
        });
        driversNext = Array.from(map.values());
      }
      if(Array.isArray(payload.master?.drivers)){
        const map = new Map((driversNext || []).map(driver=> [String(driver.id ?? driver.code ?? Math.random()), driver]));
        payload.master.drivers.forEach(driver=>{
          if(driver && driver.id != null) map.set(String(driver.id), driver);
        });
        driversNext = Array.from(map.values());
      }
      let handoffNext = state.data.handoff || {};
      if(payload.handoff && typeof payload.handoff === 'object'){
        const merged = { ...handoffNext };
        Object.keys(payload.handoff).forEach(orderId=>{
          merged[orderId] = { ...(handoffNext[orderId] || {}), ...(payload.handoff[orderId] || {}) };
        });
        handoffNext = merged;
      }
      let stationsNext = Array.isArray(state.data.stations)
        ? state.data.stations.map(station=> ({ ...station }))
        : [];
      if(Array.isArray(payload.master?.stations) && payload.master.stations.length){
        stationsNext = payload.master.stations.map(station=> ({ ...station }));
      }
      const stationMapNext = toStationMap(stationsNext);
      let stationRoutesNext = Array.isArray(state.data.stationCategoryRoutes)
        ? state.data.stationCategoryRoutes.map(route=> ({ ...route }))
        : [];
      if(Array.isArray(payload.master?.stationCategoryRoutes)){
        stationRoutesNext = payload.master.stationCategoryRoutes.map(route=> ({ ...route }));
      }
      let kitchenSectionsNext = Array.isArray(state.data.kitchenSections)
        ? state.data.kitchenSections.map(section=> ({ ...section }))
        : [];
      if(Array.isArray(payload.master?.kitchenSections)){
        kitchenSectionsNext = payload.master.kitchenSections.map(section=> ({ ...section }));
      }
      let categorySectionsNext = Array.isArray(state.data.categorySections)
        ? state.data.categorySections.map(entry=> ({ ...entry }))
        : [];
      if(Array.isArray(payload.master?.categorySections)){
        categorySectionsNext = payload.master.categorySections.map(entry=> ({ ...entry }));
      }
      const baseMenu = state.data.menu || {};
      let menuNext = {
        categories: Array.isArray(baseMenu.categories) ? baseMenu.categories.map(category=> ({ ...category })) : [],
        items: Array.isArray(baseMenu.items) ? baseMenu.items.map(item=> ({ ...item })) : []
      };
      if(Array.isArray(payload.master?.categories)){
        menuNext = { ...menuNext, categories: payload.master.categories.map(category=> ({ ...category })) };
      }
      if(Array.isArray(payload.master?.items)){
        menuNext = { ...menuNext, items: payload.master.items.map(item=> ({ ...item })) };
      }
      let metaNext = { ...(state.data.meta || {}) };
      if(payload.master?.metadata){
        metaNext = { ...metaNext, ...payload.master.metadata };
      }
      if(payload.meta){
        metaNext = { ...metaNext, ...payload.meta };
      }
      let syncNext = { ...(state.data.sync || {}), channel: state.data.sync?.channel || BRANCH_CHANNEL };
      syncNext.lastMessage = Date.now();
      syncNext.state = 'online';
      if(payload.master?.sync){
        syncNext = { ...syncNext, ...payload.master.sync };
      }
      if(payload.master?.channel){
        syncNext.channel = payload.master.channel;
      }
      if(meta && meta.channel){
        syncNext.channel = meta.channel;
      }
      if(!syncNext.channel){
        syncNext.channel = BRANCH_CHANNEL;
      }
      return {
        ...state,
        data:{
          ...state.data,
          jobOrders: mergedOrders,
          jobs: jobsIndexedNext,
          expoSource: expoSourceNext,
          expoTickets: expoTicketsNext,
          deliveries: deliveriesNext,
          drivers: driversNext,
          handoff: handoffNext,
          stations: stationsNext,
          stationMap: stationMapNext,
          stationCategoryRoutes: stationRoutesNext,
          kitchenSections: kitchenSectionsNext,
          categorySections: categorySectionsNext,
          menu: menuNext,
          meta: metaNext,
          sync: syncNext
        }
      };
    });
  };

  function createKitchenSync(appInstance, options={}){
    const WebSocketX = U.WebSocketX || U.WebSocket;
    const endpoint = options.endpoint;
    if(!WebSocketX){
      console.warn('[Mishkah][KDS] WebSocket adapter unavailable. Sync is disabled.');
    }
    if(!endpoint){
      console.warn('[Mishkah][KDS] Missing WebSocket endpoint. Sync is disabled.');
    }
    if(!WebSocketX || !endpoint) return null;
    const channelName = options.channel ? normalizeChannelName(options.channel, BRANCH_CHANNEL) : '';
    const topicPrefix = channelName ? `${channelName}:` : '';
    const topicOrders = options.topicOrders || `${topicPrefix}pos:kds:orders`;
    const topicJobs = options.topicJobs || `${topicPrefix}kds:jobs:updates`;
    const topicDelivery = options.topicDelivery || `${topicPrefix}kds:delivery:updates`;
    const topicHandoff = options.topicHandoff || `${topicPrefix}kds:handoff:updates`;
    const token = options.token;
    let socket = null;
    let ready = false;
    let awaitingAuth = false;
    const queue = [];
    const sendEnvelope = (payload)=>{
      if(!socket) return;
      if(ready && !awaitingAuth){
        socket.send(payload);
      } else {
        queue.push(payload);
      }
    };
    const flushQueue = ()=>{
      if(!ready || awaitingAuth) return;
      while(queue.length){
        socket.send(queue.shift());
      }
    };
    socket = new WebSocketX(endpoint, {
      autoReconnect:true,
      ping:{ interval:15000, timeout:7000, send:{ type:'ping' }, expect:'pong' }
    });
    socket.on('open', ()=>{
      ready = true;
      console.info('[Mishkah][KDS] Sync connection opened.', { endpoint });
      if(token){
        awaitingAuth = true;
        socket.send({ type:'auth', data:{ token } });
      } else {
        socket.send({ type:'subscribe', topic: topicOrders });
        socket.send({ type:'subscribe', topic: topicJobs });
        socket.send({ type:'subscribe', topic: topicDelivery });
        socket.send({ type:'subscribe', topic: topicHandoff });
        flushQueue();
      }
    });
    socket.on('close', (event)=>{
      ready = false;
      awaitingAuth = false;
      console.warn('[Mishkah][KDS] Sync connection closed.', { code: event?.code, reason: event?.reason });
    });
    socket.on('error', (error)=>{
      ready = false;
      console.error('[Mishkah][KDS] Sync connection error.', error);
    });
    socket.on('message', (msg)=>{
      if(!msg || typeof msg !== 'object') return;
      if(msg.type === 'ack'){
        if(msg.event === 'auth'){
          awaitingAuth = false;
          socket.send({ type:'subscribe', topic: topicOrders });
          socket.send({ type:'subscribe', topic: topicJobs });
          socket.send({ type:'subscribe', topic: topicDelivery });
          socket.send({ type:'subscribe', topic: topicHandoff });
          flushQueue();
        } else if(msg.event === 'subscribe'){
          flushQueue();
        }
        return;
      }
      if(msg.type === 'publish'){
        if(msg.topic === topicOrders){
          applyRemoteOrder(appInstance, msg.data || {}, msg.meta || {});
        }
        if(msg.topic === topicJobs){
          applyJobUpdateMessage(appInstance, msg.data || {}, msg.meta || {});
        }
        if(msg.topic === topicDelivery){
          applyDeliveryUpdateMessage(appInstance, msg.data || {}, msg.meta || {});
        }
        if(msg.topic === topicHandoff){
          applyHandoffUpdateMessage(appInstance, msg.data || {}, msg.meta || {});
        }
        return;
      }
    });
    const connect = ()=>{
      try { socket.connect({ waitOpen:false }); } catch(_err){}
    };
    return {
      connect,
      publishJobUpdate(update){
        if(!update || !update.jobId) return;
        sendEnvelope({ type:'publish', topic: topicJobs, data:update });
      },
      publishDeliveryUpdate(update){
        if(!update || !update.orderId) return;
        sendEnvelope({ type:'publish', topic: topicDelivery, data:update });
      },
      publishHandoffUpdate(update){
        if(!update || !update.orderId) return;
        sendEnvelope({ type:'publish', topic: topicHandoff, data:update });
      },
      publishOrder(payload){
        if(!payload) return;
        sendEnvelope({ type:'publish', topic: topicOrders, data:payload });
      }
    };
  }
  const describeInteractiveNode = (node)=>{
    if(!node || node.nodeType !== 1) return null;
    const dataset = {};
    if(node.dataset){
      Object.keys(node.dataset).forEach(key=>{ dataset[key] = node.dataset[key]; });
    }
    const buildPath = ()=>{
      const segments = [];
      let current = node;
      while(current && current.nodeType === 1 && segments.length < 6){
        let segment = current.tagName ? current.tagName.toLowerCase() : '';
        if(current.id){
          segment += `#${current.id}`;
        } else if(current.classList && current.classList.length){
          segment += '.' + Array.from(current.classList).slice(0, 2).join('.');
        }
        segments.push(segment);
        current = current.parentElement;
      }
      return segments.reverse().join(' > ');
    };
    const textContent = (node.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      tag: node.tagName ? node.tagName.toLowerCase() : 'unknown',
      gkey: node.getAttribute && node.getAttribute('data-m-gkey') || '',
      key: node.getAttribute && node.getAttribute('data-m-key') || '',
      classList: node.classList ? Array.from(node.classList) : [],
      dataset,
      path: buildPath(),
      text: textContent.length > 120 ? `${textContent.slice(0, 117)}…` : textContent
    };
  };

  const logKdsInteractiveNodes = ()=>{
    if(typeof document === 'undefined') return [];
    const root = document.querySelector('#app');
    if(!root) return [];
    const nodes = Array.from(root.querySelectorAll('[data-m-gkey]'));
    const snapshot = nodes.map(describeInteractiveNode).filter(Boolean);
    if(typeof console !== 'undefined'){
      if(typeof console.groupCollapsed === 'function'){
        console.groupCollapsed(`[Mishkah][KDS] Interactive nodes snapshot (${snapshot.length})`);
        if(typeof console.table === 'function') console.table(snapshot);
        else console.log(snapshot);
        console.groupEnd();
      } else {
        console.log(`[Mishkah][KDS] Interactive nodes snapshot (${snapshot.length})`, snapshot);
      }
    }
    return snapshot;
  };

  const logKdsOrdersRegistry = ()=>{
    const rawOrders = typeof app.getOrders === 'function' ? app.getOrders() : [];
    const snapshot = rawOrders.map((order, index)=>({
      index,
      name: order?.name || '(anonymous)',
      on: Array.isArray(order?.on) ? order.on.slice() : [],
      gkeys: Array.isArray(order?.gkeys) ? order.gkeys.slice() : [],
      keys: Array.isArray(order?.keys) ? order.keys.slice() : [],
      disabled: !!order?.disabled
    }));
    if(typeof console !== 'undefined'){
      if(typeof console.groupCollapsed === 'function'){
        console.groupCollapsed(`[Mishkah][KDS] Orders registry snapshot (${snapshot.length})`);
        snapshot.forEach(entry=> console.log(entry));
        console.groupEnd();
      } else {
        console.log(`[Mishkah][KDS] Orders registry snapshot (${snapshot.length})`, snapshot);
      }
    }
    return snapshot;
  };

  const scheduleInteractiveSnapshot = ()=>{
    if(typeof document === 'undefined') return;
    const run = ()=>{ logKdsInteractiveNodes(); };
    const invoke = ()=>{
      if(typeof requestAnimationFrame === 'function') requestAnimationFrame(()=> run());
      else setTimeout(run, 0);
    };
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=> invoke(), { once:true });
    } else {
      invoke();
    }
  };

  const setupKdsDevtools = ()=>{
    if(typeof window === 'undefined') return;
    const dev = window.__MishkahKDSDev__ || {};
    const announced = !!dev.__announced;
    dev.logOrders = logKdsOrdersRegistry;
    dev.inspectInteractiveNodes = logKdsInteractiveNodes;
    dev.getOrders = ()=> (typeof app.getOrders === 'function' ? app.getOrders() : []);
    dev.snapshot = ()=>({ orders: logKdsOrdersRegistry(), nodes: logKdsInteractiveNodes() });
    dev.logDomSnapshot = logKdsInteractiveNodes;
    window.__MishkahKDSDev__ = dev;
    if(!announced){
      if(typeof console !== 'undefined'){
        console.info('%c[Mishkah KDS] Developer helpers ready → use __MishkahKDSDev__.logOrders() and .inspectInteractiveNodes() for diagnostics.', 'color:#38bdf8;font-weight:bold;');
      }
      try{
        Object.defineProperty(dev, '__announced', { value:true, enumerable:false, configurable:true, writable:false });
      } catch(_err){ dev.__announced = true; }
    }
  };

  const kdsOrders = {
    'kds.theme.set':{
      on:['click'],
      gkeys:['kds:theme:set'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-theme]');
        if(!btn) return;
        const theme = btn.getAttribute('data-theme');
        if(!theme) return;
        ctx.setState(state=>({
          ...state,
          env:{ ...(state.env || {}), theme }
        }));
      }
    },
    'kds.lang.set':{
      on:['click'],
      gkeys:['kds:lang:set'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-lang]');
        if(!btn) return;
        const langValue = btn.getAttribute('data-lang');
        if(!langValue) return;
        ctx.setState(state=>({
          ...state,
          env:{ ...(state.env || {}), lang: langValue, dir: langValue === 'ar' ? 'rtl' : 'ltr' }
        }));
      }
    },
    'kds.tab.switch':{
      on:['click'],
      gkeys:['kds:tab:switch'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-section-id]');
        if(!btn) return;
        const sectionId = btn.getAttribute('data-section-id');
        if(!sectionId) return;
        ctx.setState(state=>({
          ...state,
          data:{
            ...state.data,
            filters:{ ...state.data.filters, activeTab: sectionId }
          }
        }));
      }
    },
    'kds.job.start':{
      on:['click'],
      gkeys:['kds:job:start'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-job-id]');
        if(!btn) return;
        const jobId = btn.getAttribute('data-job-id');
        if(!jobId) return;
        const nowIso = new Date().toISOString();
        const nowMs = Date.parse(nowIso);
        ctx.setState(state=> applyJobsUpdate(state, list=> list.map(job=> job.id === jobId ? startJob(job, nowIso, nowMs) : job)));
        emitSync({ type:'job:update', jobId, payload:{ status:'in_progress', progressState:'cooking', startedAt: nowIso, updatedAt: nowIso } });
        if(syncClient){
          syncClient.publishJobUpdate({ jobId, payload:{ status:'in_progress', progressState:'cooking', startedAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.job.finish':{
      on:['click'],
      gkeys:['kds:job:finish'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-job-id]');
        if(!btn) return;
        const jobId = btn.getAttribute('data-job-id');
        if(!jobId) return;
        const nowIso = new Date().toISOString();
        const nowMs = Date.parse(nowIso);
        ctx.setState(state=> applyJobsUpdate(state, list=> list.map(job=> job.id === jobId ? finishJob(job, nowIso, nowMs) : job)));
        emitSync({ type:'job:update', jobId, payload:{ status:'ready', progressState:'completed', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso } });
        if(syncClient){
          syncClient.publishJobUpdate({ jobId, payload:{ status:'ready', progressState:'completed', readyAt: nowIso, completedAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.handoff.assembled':{
      on:['click'],
      gkeys:['kds:handoff:assembled'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        ctx.setState(state=>{
          const handoff = state.data.handoff || {};
          const next = { ...handoff, [orderId]: { ...(handoff[orderId] || {}), status:'assembled', assembledAt: nowIso, updatedAt: nowIso } };
          return {
            ...state,
            data:{
              ...state.data,
              handoff: next
            }
          };
        });
        emitSync({ type:'handoff:update', orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });
        if(syncClient && typeof syncClient.publishHandoffUpdate === 'function'){
          syncClient.publishHandoffUpdate({ orderId, payload:{ status:'assembled', assembledAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.handoff.served':{
      on:['click'],
      gkeys:['kds:handoff:served'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        ctx.setState(state=>{
          const handoff = state.data.handoff || {};
          const next = { ...handoff, [orderId]: { ...(handoff[orderId] || {}), status:'served', servedAt: nowIso, updatedAt: nowIso } };
          return {
            ...state,
            data:{
              ...state.data,
              handoff: next
            }
          };
        });
        emitSync({ type:'handoff:update', orderId, payload:{ status:'served', servedAt: nowIso, updatedAt: nowIso } });
        if(syncClient && typeof syncClient.publishHandoffUpdate === 'function'){
          syncClient.publishHandoffUpdate({ orderId, payload:{ status:'served', servedAt: nowIso, updatedAt: nowIso } });
        }
      }
    },
    'kds.delivery.assign':{
      on:['click'],
      gkeys:['kds:delivery:assign'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:true,
            modals:{ ...(state.ui?.modals || {}), driver:true },
            deliveryAssignment:{ orderId }
          }
        }));
      }
    },
    'kds.delivery.selectDriver':{
      on:['click'],
      gkeys:['kds:delivery:select-driver'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id][data-driver-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        const driverId = btn.getAttribute('data-driver-id');
        if(!orderId || !driverId) return;
        const nowIso = new Date().toISOString();
        let assignmentPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const assignments = { ...(deliveries.assignments || {}) };
          const driver = (state.data.drivers || []).find(d=> String(d.id) === driverId) || {};
          assignments[orderId] = {
            ...(assignments[orderId] || {}),
            driverId,
            driverName: driver.name || driverId,
            driverPhone: driver.phone || '',
            vehicleId: driver.vehicle_id || driver.vehicleId || '',
            status: 'assigned',
            assignedAt: assignments[orderId]?.assignedAt || nowIso
          };
          assignmentPayload = assignments[orderId];
          emitSync({ type:'delivery:update', orderId, payload:{ assignment: assignments[orderId] } });
          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments, settlements: { ...(deliveries.settlements || {}) } }
            },
            ui:{
              ...(state.ui || {}),
              modalOpen:false,
              modals:{ ...(state.ui?.modals || {}), driver:false },
              deliveryAssignment:null
            }
          };
        });
        if(syncClient && assignmentPayload){
          syncClient.publishDeliveryUpdate({ orderId, payload:{ assignment: assignmentPayload } });
        }
      }
    },
    'kds.delivery.complete':{
      on:['click'],
      gkeys:['kds:delivery:complete'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        let assignmentPayload = null;
        let settlementPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const assignments = { ...(deliveries.assignments || {}) };
          const settlements = { ...(deliveries.settlements || {}) };
          assignments[orderId] = {
            ...(assignments[orderId] || {}),
            status:'delivered',
            deliveredAt: nowIso
          };
          assignmentPayload = assignments[orderId];
          settlements[orderId] = settlements[orderId] || { status:'pending', updatedAt: nowIso };
          settlementPayload = settlements[orderId];
          emitSync({ type:'delivery:update', orderId, payload:{ assignment: assignments[orderId] } });
          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments, settlements }
            }
          };
        });
        if(syncClient){
          syncClient.publishDeliveryUpdate({ orderId, payload:{ assignment: assignmentPayload, settlement: settlementPayload } });
        }
      }
    },
    'kds.delivery.settle':{
      on:['click'],
      gkeys:['kds:delivery:settle'],
      handler:(event, ctx)=>{
        const btn = event?.target && event.target.closest('[data-order-id]');
        if(!btn) return;
        const orderId = btn.getAttribute('data-order-id');
        if(!orderId) return;
        const nowIso = new Date().toISOString();
        let settlementPayload = null;
        ctx.setState(state=>{
          const deliveries = state.data.deliveries || { assignments:{}, settlements:{} };
          const settlements = { ...(deliveries.settlements || {}) };
          settlements[orderId] = { ...(settlements[orderId] || {}), status:'settled', settledAt: nowIso };
          settlementPayload = settlements[orderId];
          emitSync({ type:'delivery:update', orderId, payload:{ settlement: settlements[orderId] } });
          return {
            ...state,
            data:{
              ...state.data,
              deliveries:{ assignments: { ...(deliveries.assignments || {}) }, settlements }
            }
          };
        });
        if(syncClient && settlementPayload){
          syncClient.publishDeliveryUpdate({ orderId, payload:{ settlement: settlementPayload } });
        }
      }
    },
    'ui.modal.close':{
      on:['click'],
      gkeys:['ui:modal:close'],
      handler:(event, ctx)=>{
        event?.preventDefault();
        ctx.setState(state=>({
          ...state,
          ui:{
            ...(state.ui || {}),
            modalOpen:false,
            modals:{ ...(state.ui?.modals || {}), driver:false },
            deliveryAssignment:null
          }
        }));
      }
    }
  };

  app.setOrders(Object.assign({}, UI.orders || {}, auto.orders || {}, kdsOrders));
  logKdsOrdersRegistry();
  app.mount('#app');
  scheduleInteractiveSnapshot();
  setupKdsDevtools();

  const tick = setInterval(()=>{
    app.setState(state=>({
      ...state,
      data:{
        ...state.data,
        now: Date.now()
      }
    }));
  }, 1000);

  if(typeof window !== 'undefined'){
    window.addEventListener('beforeunload', ()=> clearInterval(tick));
  }
})();
