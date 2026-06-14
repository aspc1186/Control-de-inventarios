// api/articulos/deactivate.js — Mark articles as inactive
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

  const { skus, usuario } = req.body || {};
  if (!skus || !Array.isArray(skus) || !skus.length) {
    return res.status(400).json({ error: 'skus array required' });
  }

  const sql = getSQL();
  const { fecha, hora } = nowParts();
  let deactivated = 0;

  try {
    // Add estado column if it doesn't exist
    await sql`
      ALTER TABLE articulos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activo'
    `.catch(() => {});

    for (const sku of skus) {
      try {
        const rows = await sql`
          UPDATE articulos
          SET estado = 'Inactivo', updated_at = NOW()
          WHERE sku = ${sku.toUpperCase()} AND (estado IS NULL OR estado = 'Activo')
          RETURNING sku, nombre, stock`;

        if (rows[0]) {
          deactivated++;
          // Log movement if had stock
          if (Number(rows[0].stock) > 0) {
            await sql`
              INSERT INTO movimientos
                (tipo, sku, articulo, cantidad, stock_anterior, stock_resultante,
                 usuario, observacion, fecha, hora)
              VALUES (
                'AJUSTE_NEG', ${sku.toUpperCase()}, ${rows[0].nombre},
                ${Number(rows[0].stock)}, ${Number(rows[0].stock)}, 0,
                ${usuario||'Sistema'}, 'Artículo desactivado por sincronización de inventario',
                ${fecha}, ${hora}
              )`;
          }
        }
      } catch (err) {
        console.warn('Deactivate error for', sku, err.message);
      }
    }

    res.json({ ok: true, deactivated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
