const MOTOPARTS_TEXT_FIELDS = [
  'referencia_fabricante',
  'referencia_oem',
  'referencias_alternas',
  'marca_moto',
  'linea_moto',
  'modelo_moto',
  'cilindraje',
  'anio_inicial',
  'anio_final',
  'vin',
  'numero_motor',
  'proveedor_origen',
  'ubicacion_motoparts',
  'compatibilidad_moto',
  'tipo_repuesto',
  'posicion_moto',
  'foto_url',
];

const MOTOPARTS_JSON_FIELDS = [
  'fotos',
  'motos_compatibles',
];

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? cleanText(item) : item))
      .filter(Boolean);
  }
  const text = cleanText(value);
  if (!text) return [];
  if (/^\s*\[/.test(text)) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }
  return text
    .split(/[;\n|]+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalizeMotoPartsProduct(item = {}) {
  const out = {};
  for (const field of MOTOPARTS_TEXT_FIELDS) out[field] = cleanText(item[field]);

  out.fotos = parseList(item.fotos || item.imagenes);
  out.motos_compatibles = parseList(item.motos_compatibles || item.compatibilidades);

  if (!out.foto_url) out.foto_url = cleanText(item.foto || item.imagen || item.image_url);
  if (!out.ubicacion_motoparts) out.ubicacion_motoparts = cleanText(item.ubicacion);
  if (!out.proveedor_origen) out.proveedor_origen = cleanText(item.proveedor);
  if (!out.referencia_fabricante) out.referencia_fabricante = cleanText(item.sku || item.codigo);
  if (!out.compatibilidad_moto && out.motos_compatibles.length) {
    out.compatibilidad_moto = out.motos_compatibles.join('; ');
  }

  return out;
}

module.exports = {
  MOTOPARTS_TEXT_FIELDS,
  MOTOPARTS_JSON_FIELDS,
  normalizeMotoPartsProduct,
};
