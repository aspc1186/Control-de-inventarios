// api/movimientos/index.js — GET list with filters, POST create
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
  const sql = getSQL();

  // GET /api/movimientos
  if (req.method === 'GET') {
    try {
      const { sku, tipo, usuario, limit = 2000, offset = 0 } = req.query;

      let rows;
      if (sku && tipo) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE sku = ${sku.toUpperCase()} AND tipo = ${tipo}
          ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      } else if (sku) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE sku = ${sku.toUpperCase()} OR articulo ILIKE ${'%'+sku+'%'}
          ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      } else if (tipo) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE tipo = ${tipo}
          ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      } else if (usuario) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE usuario ILIKE ${'%'+usuario+'%'}
          ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      } else {
        rows = await sql`
          SELECT * FROM movimientos
          ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      }

      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/movimientos
  if (req.method === 'POST') {
    const { tipo, sku, cantidad, usuario, observacion, proveedor, factura, area } = req.body || {};
    if (!tipo || !sku || !cantidad) return res.status(400).json({ error: 'tipo, sku y cantidad requeridos' });
    const qty = Number(cantidad);
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

    try {
      const arts = await sql`SELECT * FROM articulos WHERE sku = ${sku.toUpperCase()}`;
      if (!arts[0]) return res.status(404).json({ error: 'SKU no encontrado' });

      const art = arts[0];
      const anterior = Number(art.stock || 0);
      const isEntry  = ['ENTRADA','AJUSTE_POS'].includes(tipo);

      if (!isEntry && qty > anterior) {
        return res.status(400).json({ error: `Stock insuficiente. Disponible: ${anterior}` });
      }

      const nuevo = isEntry ? anterior + qty : anterior - qty;
      const { fecha, hora } = nowParts();

      if (tipo === 'ENTRADA') {
        await sql`UPDATE articulos SET stock=${nuevo}, ultima_entrada=${fecha}, updated_at=NOW() WHERE sku=${sku.toUpperCase()}`;
      } else if (tipo === 'SALIDA') {
        await sql`UPDATE articulos SET stock=${nuevo}, ultima_salida=${fecha}, updated_at=NOW() WHERE sku=${sku.toUpperCase()}`;
      } else {
        await sql`UPDATE articulos SET stock=${nuevo}, updated_at=NOW() WHERE sku=${sku.toUpperCase()}`;
      }

      const movRows = await sql`
        INSERT INTO movimientos
          (tipo,sku,articulo,cantidad,stock_anterior,stock_resultante,usuario,observacion,proveedor,factura,area,fecha,hora)
        VALUES (${tipo},${sku.toUpperCase()},${art.nombre},${qty},${anterior},${nuevo},
                ${usuario||'Sistema'},${observacion||null},${proveedor||null},${factura||null},${area||null},${fecha},${hora})
        RETURNING *`;

      return res.status(201).json({ ok:true, mov:movRows[0], stock_anterior:anterior, stock_nuevo:nuevo });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
