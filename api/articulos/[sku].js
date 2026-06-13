// api/articulos/[sku].js — GET / PUT / DELETE by SKU
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();
  const sku = (req.query.sku || '').toUpperCase();
  if (!sku) return res.status(400).json({ error: 'SKU requerido' });

  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM articulos WHERE sku = ${sku}`;
      if (!rows[0]) return res.status(404).json({ error: 'Artículo no encontrado', sku });
      const movs = await sql`SELECT * FROM movimientos WHERE sku = ${sku} ORDER BY created_at DESC LIMIT 25`;
      return res.json({ ...rows[0], movimientos: movs });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    try {
      const rows = await sql`
        UPDATE articulos SET
          nombre        = COALESCE(${b.nombre||null}, nombre),
          descripcion   = COALESCE(${b.descripcion!==undefined ? b.descripcion : null}, descripcion),
          categoria     = COALESCE(${b.categoria||null}, categoria),
          marca         = COALESCE(${b.marca||null}, marca),
          unidad        = COALESCE(${b.unidad||null}, unidad),
          ubicacion     = COALESCE(${b.ubicacion||null}, ubicacion),
          ubicacion_label = COALESCE(${b.ubicacion_label||null}, ubicacion_label),
          bodega_id     = COALESCE(${b.bodega_id||null}, bodega_id),
          stock_minimo  = COALESCE(${b.stock_minimo!=null ? Number(b.stock_minimo) : null}, stock_minimo),
          costo         = COALESCE(${b.costo!=null ? Number(b.costo) : null}, costo),
          proveedor     = COALESCE(${b.proveedor||null}, proveedor),
          updated_at    = NOW()
        WHERE sku = ${sku} RETURNING *`;
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
      return res.json(rows[0]);
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (req.method === 'DELETE') {
    try {
      await sql`DELETE FROM articulos WHERE sku = ${sku}`;
      return res.json({ ok: true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  res.status(405).end();
};
