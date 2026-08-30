const LOCATION_TYPES = {
  SHELF: 'SHELF',
  FLOOR: 'FLOOR',
  SOLTRECH: 'SOLTRECH',
  FANALCA: 'FANALCA',
};

const SHELF_RE = /^EST-(0[1-9]|[1-9][0-9]|100)$/;
const FLOOR_RE = /^[A-Z]-(0[1-9]|[1-9][0-9])-(0[1-9]|[1-9][0-9])$/;
const SOLTRECH_RE = /^SOLTRECH(?:-(0[1-9]|[1-9][0-9]))?$/;

function normalizeLocationCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function classifyMotoPartsLocation(code) {
  const normalized = normalizeLocationCode(code);
  if (!normalized) return null;
  if (SHELF_RE.test(normalized)) return { tipo: LOCATION_TYPES.SHELF, grupo: 'ESTANTERIAS' };
  if (FLOOR_RE.test(normalized)) return { tipo: LOCATION_TYPES.FLOOR, grupo: 'PISO' };
  if (SOLTRECH_RE.test(normalized)) return { tipo: LOCATION_TYPES.SOLTRECH, grupo: 'PROVEEDOR_SOLTRECH' };
  if (normalized === 'FANALCA') return { tipo: LOCATION_TYPES.FANALCA, grupo: 'PROVEEDOR_FANALCA' };
  return null;
}

function validateMotoPartsLocation(code) {
  const normalized = normalizeLocationCode(code);
  const match = classifyMotoPartsLocation(normalized);
  if (!match) {
    return {
      ok: false,
      code: normalized,
      message: 'Ubicacion MotoParts invalida. Usa EST-01..EST-100, A-01-01..Z-99-99, SOLTRECH o FANALCA.',
    };
  }
  return { ok: true, code: normalized, ...match };
}

function normalizeMotoPartsLocation(input = {}) {
  const validation = validateMotoPartsLocation(input.codigo || input.code || input.nombre);
  if (!validation.ok) return validation;
  const allowVin = validation.tipo === LOCATION_TYPES.FANALCA;
  const empresaId = input.empresa_id || null;
  const capacity = input.capacidad === undefined || input.capacidad === '' ? null : Number(input.capacidad);
  const routeOrder = input.recorrido_orden === undefined || input.recorrido_orden === '' ? null : Number(input.recorrido_orden);
  if (capacity !== null && !Number.isFinite(capacity)) {
    return { ok: false, code: validation.code, message: 'La capacidad debe ser numerica.' };
  }
  if (routeOrder !== null && !Number.isInteger(routeOrder)) {
    return { ok: false, code: validation.code, message: 'El orden de recorrido debe ser un numero entero.' };
  }
  return {
    ok: true,
    id: String(input.id || `${empresaId || '__GLOBAL__'}:${validation.code}`).trim(),
    codigo: validation.code,
    nombre: String(input.nombre || validation.code).trim(),
    tipo: validation.tipo,
    grupo: validation.grupo,
    descripcion: input.descripcion || null,
    bodega_id: input.bodega_id || null,
    empresa_id: empresaId,
    estado: String(input.estado || 'ACTIVA').trim().toUpperCase(),
    permite_multiples_referencias: input.permite_multiples_referencias !== false,
    permite_vin: input.permite_vin === true || allowVin,
    capacidad: capacity,
    recorrido_orden: routeOrder,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

module.exports = {
  LOCATION_TYPES,
  normalizeLocationCode,
  classifyMotoPartsLocation,
  validateMotoPartsLocation,
  normalizeMotoPartsLocation,
};
