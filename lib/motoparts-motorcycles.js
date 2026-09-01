function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeVin(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function validateVin(value) {
  const vin = normalizeVin(value);
  if (!vin) return { ok: false, vin, message: 'VIN requerido.' };
  if (vin.length < 6 || vin.length > 32) return { ok: false, vin, message: 'VIN invalido. Debe tener entre 6 y 32 caracteres.' };
  if (!/^[A-Z0-9-]+$/.test(vin)) return { ok: false, vin, message: 'VIN invalido. Usa solo letras, numeros o guiones.' };
  return { ok: true, vin };
}

function normalizeMotorcycle(input = {}) {
  const validation = validateVin(input.vin || input.VIN);
  if (!validation.ok) return validation;
  const empresaId = cleanText(input.empresa_id);
  const chasis = cleanText(input.numero_chasis || input.chasis) || validation.vin;
  return {
    ok: true,
    id: cleanText(input.id) || `${empresaId || '__GLOBAL__'}:${validation.vin}`,
    vin: validation.vin,
    numero_chasis: chasis,
    numero_motor: cleanText(input.numero_motor || input.motor),
    marca: cleanText(input.marca),
    linea: cleanText(input.linea || input.línea),
    modelo: cleanText(input.modelo),
    anio_modelo: cleanText(input.anio_modelo || input.ano_modelo || input.año_modelo),
    cilindraje: cleanText(input.cilindraje),
    color: cleanText(input.color),
    tipo: cleanText(input.tipo) || 'MOTOCICLETA',
    estado: cleanText(input.estado) || 'RECIBIDA',
    bodega: cleanText(input.bodega),
    ubicacion_actual: cleanText(input.ubicacion_actual || input.ubicacion) || 'FANALCA',
    fecha_recepcion: cleanText(input.fecha_recepcion),
    proveedor: cleanText(input.proveedor),
    orden_compra: cleanText(input.orden_compra),
    costo: input.costo === undefined || input.costo === '' ? null : Number(input.costo),
    precio_venta: input.precio_venta === undefined || input.precio_venta === '' ? null : Number(input.precio_venta),
    cliente_reservado: cleanText(input.cliente_reservado),
    estado_comercial: cleanText(input.estado_comercial) || 'DISPONIBLE',
    empresa_id: empresaId,
  };
}

module.exports = {
  cleanText,
  normalizeVin,
  validateVin,
  normalizeMotorcycle,
};
