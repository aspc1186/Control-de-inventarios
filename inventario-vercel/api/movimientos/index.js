// api/movimientos/index.js
const { sql, cors } = require('../_db');

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

  // GET /api/movimientos?sku=XXX
  if (req.method === 'GET') {
    const sku = req.query.sku;
    try {
      const rows = sku
        ? (await sql`SELECT * FROM movimientos WHERE sku = ${sku.toUpperCase()} ORDER BY created_at DESC LIMIT 50`).rows
        : (await sql`SELECT * FROM movimientos ORDER BY created_at DESC LIMIT 100`).rows;
      return res.json({ data: rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/movimientos
  if (req.method === 'POST') {
    const b = req.body || {};
    const { tipo, sku, cantidad, usuario, observacion, proveedor, factura, area } = b;
    if (!tipo || !sku || !cantidad) return res.status(400).json({ error: 'tipo, sku y cantidad requeridos' });
    const qty = Number(cantidad);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

    try {
      // Get current stock with lock
      const { rows: artRows } = await sql`SELECT * FROM articulos WHERE sku = ${sku.toUpperCase()}`;
      if (!artRows[0]) return res.status(404).json({ error: 'SKU no encontrado' });

      const art = artRows[0];
      const anterior = Number(art.stock);

      if ((tipo === 'SALIDA' || tipo === 'AJUSTE_NEG') && qty > anterior) {
        return res.status(400).json({ error: `Stock insuficiente. Disponible: ${anterior}` });
      }

      const isEntry = ['ENTRADA','AJUSTE_POS'].includes(tipo);
      const nuevo   = isEntry ? anterior + qty : anterior - qty;
      const { fecha, hora } = nowParts();

      // Update stock
      if (tipo === 'ENTRADA') {
        await sql`UPDATE articulos SET stock = ${nuevo}, ultima_entrada = ${fecha}, updated_at = NOW() WHERE sku = ${sku.toUpperCase()}`;
      } else if (tipo === 'SALIDA') {
        await sql`UPDATE articulos SET stock = ${nuevo}, ultima_salida = ${fecha}, updated_at = NOW() WHERE sku = ${sku.toUpperCase()}`;
      } else {
        await sql`UPDATE articulos SET stock = ${nuevo}, updated_at = NOW() WHERE sku = ${sku.toUpperCase()}`;
      }

      // Insert movement
      const { rows: movRows } = await sql`
        INSERT INTO movimientos
          (tipo, sku, articulo, cantidad, stock_anterior, stock_resultante,
           usuario, observacion, proveedor, factura, area, fecha, hora)
        VALUES (
          ${tipo}, ${sku.toUpperCase()}, ${art.nombre}, ${qty},
          ${anterior}, ${nuevo},
          ${usuario || 'Sistema'}, ${observacion || null},
          ${proveedor || null}, ${factura || null}, ${area || null},
          ${fecha}, ${hora}
        ) RETURNING *`;

      return res.status(201).json({
        ok: true,
        mov: movRows[0],
        stock_anterior: anterior,
        stock_nuevo: nuevo
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
