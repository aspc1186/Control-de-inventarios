const COMMON_MODULES = [
  'dashboard', 'inventario', 'movimientos', 'ubicaciones', 'proveedores',
  'clientes', 'compras', 'ciclicos', 'conciliacion', 'reportes', 'usuarios',
  'auditoria', 'importar'
];

const MODULE_REGISTRY = {
  dashboard: { label: 'Dashboard', group: 'principal' },
  inventario: { label: 'Inventario', group: 'operacion' },
  movimientos: { label: 'Kardex / Movimientos', group: 'operacion' },
  ubicaciones: { label: 'Bodegas y ubicaciones', group: 'bodegas' },
  proveedores: { label: 'Proveedores', group: 'operacion' },
  clientes: { label: 'Clientes', group: 'operacion' },
  compras: { label: 'Compras', group: 'operacion' },
  pedidos: { label: 'Pedidos', group: 'operacion' },
  comercial: { label: 'Comercial', group: 'operacion' },
  logistica: { label: 'Logistica WMS', group: 'operacion' },
  'generar-qr': { label: 'Generar QR', group: 'bodegas' },
  escaner: { label: 'Escaner QR', group: 'bodegas' },
  ciclicos: { label: 'Conteos ciclicos', group: 'inventario' },
  conciliacion: { label: 'Conciliacion', group: 'inventario' },
  reportes: { label: 'Reportes', group: 'analitica' },
  auditoria: { label: 'Auditoria', group: 'seguridad' },
  usuarios: { label: 'Usuarios', group: 'administracion' },
  integraciones: { label: 'Integraciones ERP', group: 'administracion' },
  respaldos: { label: 'Respaldos', group: 'administracion' },
  traslados: { label: 'Traslados', group: 'wms' },
};

const PLAN_MODULES = {
  FREE: ['dashboard', 'inventario', 'movimientos', 'clientes', 'reportes'],
  LITE: ['dashboard', 'inventario', 'movimientos', 'ubicaciones', 'proveedores', 'clientes', 'reportes', 'importar'],
  PRO: ['dashboard', 'inventario', 'movimientos', 'ubicaciones', 'proveedores', 'clientes', 'compras', 'pedidos', 'comercial', 'ciclicos', 'conciliacion', 'reportes', 'usuarios', 'respaldos', 'generar-qr', 'escaner', 'importar'],
  WMS: ['dashboard', 'inventario', 'movimientos', 'ubicaciones', 'proveedores', 'clientes', 'compras', 'pedidos', 'comercial', 'logistica', 'ciclicos', 'conciliacion', 'reportes', 'usuarios', 'auditoria', 'integraciones', 'respaldos', 'generar-qr', 'escaner', 'traslados', 'importar'],
};

const INDUSTRY_CONFIGS = {
  GENERIC: { label: 'Generica', modules: Object.keys(MODULE_REGISTRY), inventoryTypes: ['GENERAL'], fields: [], dashboardWidgets: ['inventory_value', 'stock_alerts', 'purchase_orders'] },
  HARDWARE_STORE: { label: 'Ferreteria', modules: COMMON_MODULES.concat(['pedidos', 'generar-qr', 'escaner']), inventoryTypes: ['TORNILLERIA', 'HERRAMIENTAS', 'ELECTRICOS', 'PINTURAS', 'PVC', 'SEGURIDAD_INDUSTRIAL'], fields: ['marca', 'referencia', 'presentacion', 'calibre', 'medida', 'color', 'material', 'unidad_empaque', 'codigo_barras', 'compatibilidad'], dashboardWidgets: ['stock_alerts', 'reorder_points', 'category_value'] },
  METALWORKING: { label: 'Metalmecanica', modules: COMMON_MODULES.concat(['pedidos', 'logistica', 'traslados', 'generar-qr', 'escaner']), inventoryTypes: ['INSUMOS_REPUESTOS', 'LAMINAS_TUBERIAS', 'GASES_INDUSTRIALES'], fields: ['tipo_insumo', 'equipo_compatible', 'familia_material', 'material', 'norma', 'aleacion', 'espesor', 'calibre', 'diametro', 'largo', 'ancho', 'alto', 'peso_teorico', 'peso_real', 'estado_material', 'lote', 'certificado', 'tipo_gas', 'cilindro_id', 'psi_actual'], dashboardWidgets: ['critical_supplies', 'available_material', 'scraps', 'gas_recharge_alerts'] },
  CHEMICAL: { label: 'Quimica', modules: COMMON_MODULES.concat(['generar-qr', 'escaner']), inventoryTypes: ['MATERIAS_PRIMAS', 'REACTIVOS', 'PROCESO', 'TERMINADOS', 'RESIDUOS'], fields: ['nombre_quimico', 'formula', 'concentracion', 'densidad', 'pureza', 'estado_fisico', 'riesgo', 'cas', 'lote', 'vencimiento', 'compatibilidad', 'hoja_seguridad'], dashboardWidgets: ['expiration_alerts', 'blocked_batches', 'risk_summary'] },
  IMPORTS: { label: 'Importacion', modules: COMMON_MODULES.concat(['pedidos', 'integraciones']), inventoryTypes: ['IMPORTADOS', 'TRANSITO', 'NACIONALIZADOS'], fields: ['pais_origen', 'moneda', 'trm', 'incoterm', 'codigo_hs', 'peso_bruto', 'peso_neto', 'volumen', 'embarque', 'contenedor', 'costo_nacionalizado'], dashboardWidgets: ['shipments_in_transit', 'containers', 'landed_costs'] },
  AUTO_PARTS: { label: 'Repuestos', modules: COMMON_MODULES.concat(['pedidos', 'comercial', 'generar-qr', 'escaner']), inventoryTypes: ['REPUESTOS', 'CONSUMIBLES', 'ACCESORIOS'], fields: ['referencia_oem', 'referencias_alternas', 'marca_compatible', 'modelo_compatible', 'anio_inicial', 'anio_final', 'motor', 'cilindraje', 'posicion', 'lado'], dashboardWidgets: ['top_references', 'stockouts', 'compatibility_searches'] },
  TRANSPORT: { label: 'Transporte', modules: COMMON_MODULES.concat(['logistica', 'traslados']), inventoryTypes: ['BODEGA', 'TALLER', 'LLANTAS', 'BATERIAS', 'COMBUSTIBLE'], fields: ['placa', 'vehiculo', 'orden_trabajo', 'kilometraje', 'horas_motor', 'mecanico', 'centro_costo'], dashboardWidgets: ['open_work_orders', 'vehicle_costs', 'upcoming_maintenance'] },
  FOOD: { label: 'Alimentos', modules: COMMON_MODULES.concat(['pedidos', 'comercial']), inventoryTypes: ['MATERIAS_PRIMAS', 'INGREDIENTES', 'EMPAQUE', 'PROCESO', 'TERMINADOS', 'REFRIGERADOS', 'CONGELADOS'], fields: ['lote', 'fabricacion', 'vencimiento', 'temperatura', 'almacenamiento', 'conversion', 'alergenos', 'receta', 'rendimiento', 'merma'], dashboardWidgets: ['expiration_alerts', 'batch_traceability', 'waste_costs'] },
};

function normalizePlan(plan) {
  const key = String(plan || 'FREE').toUpperCase();
  if (key === 'ENTERPRISE') return 'WMS';
  return PLAN_MODULES[key] ? key : 'FREE';
}

function normalizeIndustry(industryType) {
  const key = String(industryType || 'GENERIC').toUpperCase();
  return INDUSTRY_CONFIGS[key] ? key : 'GENERIC';
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function resolveCompanyConfig(company) {
  const plan = normalizePlan(company && company.plan);
  const industryType = normalizeIndustry(company && company.industry_type);
  const industry = INDUSTRY_CONFIGS[industryType];
  const planModules = PLAN_MODULES[plan] || PLAN_MODULES.FREE;
  const extras = Array.isArray(company && company.features_enabled) ? company.features_enabled : [];
  const industryModules = industryType === 'GENERIC' ? planModules : industry.modules;
  const modules = unique(industryModules.filter((m) => planModules.includes(m)).concat(extras.filter((m) => planModules.includes(m))));
  return { companyId: company && company.id, plan, industryType, industryLabel: industry.label, modules, inventoryTypes: industry.inventoryTypes, fields: industry.fields, dashboardWidgets: industry.dashboardWidgets };
}

module.exports = { MODULE_REGISTRY, PLAN_MODULES, INDUSTRY_CONFIGS, normalizePlan, normalizeIndustry, resolveCompanyConfig };
