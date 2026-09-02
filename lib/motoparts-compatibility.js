function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeMotoModel(input = {}) {
  const marca = cleanText(input.marca);
  const linea = cleanText(input.linea || input.línea);
  const modelo = cleanText(input.modelo);
  const cilindraje = cleanText(input.cilindraje);
  const anioDesde = cleanText(input.anio_desde || input.ano_desde || input.añoDesde || input.anioDesde);
  const anioHasta = cleanText(input.anio_hasta || input.ano_hasta || input.añoHasta || input.anioHasta);
  if (!marca || !linea) return { ok: false, error: 'Marca y linea son requeridas.' };
  const natural = [marca, linea, modelo, cilindraje, anioDesde, anioHasta].filter(Boolean).join('|');
  return {
    ok: true,
    id: cleanText(input.id) || normalizeKey(natural).replace(/[^A-Z0-9]+/g, '_'),
    marca,
    linea,
    modelo,
    cilindraje,
    anio_desde: anioDesde,
    anio_hasta: anioHasta,
    version: cleanText(input.version),
    motor: cleanText(input.motor),
    observaciones: cleanText(input.observaciones),
  };
}

function normalizeCompatibility(input = {}) {
  const repuestoId = cleanText(input.repuesto_id || input.repuestoId || input.sku || input.codigo);
  const modeloId = cleanText(input.motocicleta_modelo_id || input.motocicletaModeloId || input.modelo_id);
  if (!repuestoId) return { ok: false, error: 'repuesto_id requerido.' };
  if (!modeloId) return { ok: false, error: 'motocicleta_modelo_id requerido.' };
  return {
    ok: true,
    id: cleanText(input.id) || `${repuestoId}:${modeloId}`,
    repuesto_id: repuestoId,
    motocicleta_modelo_id: modeloId,
    observaciones: cleanText(input.observaciones),
    empresa_id: cleanText(input.empresa_id),
  };
}

function queryTokens(value) {
  return normalizeKey(value).split(/[^A-Z0-9]+/).filter((x) => x.length >= 2);
}

module.exports = {
  cleanText,
  normalizeKey,
  normalizeMotoModel,
  normalizeCompatibility,
  queryTokens,
};
