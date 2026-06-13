// api/articulos/batch.js — Bulk insert articles
const { getSQL, cors } = require('../_db');

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString('es-CO', {year:'numeric',month:'2-digit',day:'2-digit'}),
    hora:  d.toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { items } = req.body || {};
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }

  const sql = getSQL();
  let imported = 0, skipped = 0, errors = [];

  for (const b of items) {
    if (!b.sku || !b.nombre) { skipped++; continue; }
    try {
      const rows = await sql`
        INSERT INTO articulos
          (id, sku, nombre, descripcion, categoria, marca, unidad,
           ubicacion, ubicacion_label, bodega_id,
           stock, stock_minimo, stock_maximo, costo, proveedor, created_by)
        VALUES (
          ${b.id || null},
          ${b.sku.toUpperCase()},
          ${b.nombre},
          ${b.descripcion || null},
          ${b.categoria || null},
          ${b.marca || null},
          ${b.unidad || 'UND'},
          ${b.ubicacion || null},
          ${b.ubicacion_label || null},
          ${b.bodega_id || null},
          ${Number(b.stock) || 0},
          ${Number(b.stock_minimo) || 0},
          ${b.stock_maximo ? Number(b.stock_maximo) : null},
          ${Number(b.costo) || 0},
          ${b.proveedor || null},
          ${b.created_by || 'Sistema'}
        )
        ON CONFLICT (sku) DO NOTHING
        RETURNING sku`;

      if (rows[0]) {
        imported++;
        // Register initial stock movement
        if (Number(b.stock) > 0) {
          const { fecha, hora } = nowParts();
          await sql`
            INSERT INTO movimientos
              (tipo, sku, articulo, cantidad, stock_anterior, stock_resultante,
               usuario, observacion, fecha, hora)
            VALUES (
              'ENTRADA',
              ${b.sku.toUpperCase()},
              ${b.nombre},
              ${Number(b.stock)},
              0,
              ${Number(b.stock)},
              ${b.created_by || 'Sistema'},
              'Stock inicial - importación masiva',
              ${fecha},
              ${hora}
            )`;
        }
      } else {
        skipped++; // duplicate SKU
      }
    } catch (err) {
      errors.push({ sku: b.sku, error: err.message });
      if (errors.length > 20) break; // stop reporting after 20 errors
    }
  }

  res.json({ ok: true, imported, skipped, errors, total: items.length });
};
