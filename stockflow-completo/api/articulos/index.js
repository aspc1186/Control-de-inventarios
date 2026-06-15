// api/articulos/index.js — Handles ALL articulo operations
// Routes: GET /api/articulos, POST, GET /api/articulos?sku=X, PUT, DELETE, batch, deactivate
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  const action = req.query.action || '';
  const sku    = (req.query.sku || '').toUpperCase();

  // ── GET list or single ────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      if (sku) {
        const rows = await sql`SELECT * FROM articulos WHERE sku = ${sku}`;
        if (!rows[0]) return res.status(404).json({ error: 'Artículo no encontrado', sku });
        const movs = await sql`SELECT * FROM movimientos WHERE sku = ${sku} ORDER BY created_at DESC LIMIT 25`;
        return res.json({ ...rows[0], movimientos: movs });
      }
      const limit = Math.min(Number(req.query.limit)||5000, 10000);
      const rows = await sql`SELECT * FROM articulos WHERE estado = 'Activo' OR estado IS NULL ORDER BY sku LIMIT ${limit}`;
      return res.json({ data: rows, total: rows.length });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── POST batch upsert ──────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'batch') {
    const { items, modo, createdBy } = req.body || {};
    if (!items?.length) return res.status(400).json({ error: 'items requerido' });
    try {
      let created=0, updated=0, deactivated=0;
      const fecha = new Date().toLocaleDateString('es-CO',{year:'numeric',month:'2-digit',day:'2-digit'});
      const hora  = new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
      for (const b of items) {
        if (!b.sku || !b.nombre) continue;
        const s = b.sku.trim().toUpperCase();
        const ex = await sql`SELECT id,stock FROM articulos WHERE sku=${s}`;
        const stock = Number(b.stock||0);
        if (ex[0]) {
          await sql`UPDATE articulos SET nombre=${b.nombre},descripcion=${b.descripcion||null},categoria=${b.categoria||null},marca=${b.marca||null},unidad=${b.unidad||'UND'},ubicacion=${b.ubicacion||null},stock=${stock},stock_minimo=${Number(b.stock_minimo||0)},costo=${Number(b.costo||0)},proveedor=${b.proveedor||null},estado='Activo',updated_at=NOW() WHERE sku=${s}`;
          updated++;
        } else {
          await sql`INSERT INTO articulos(sku,nombre,descripcion,categoria,marca,unidad,ubicacion,stock,stock_minimo,costo,proveedor,estado,created_by)VALUES(${s},${b.nombre},${b.descripcion||null},${b.categoria||null},${b.marca||null},${b.unidad||'UND'},${b.ubicacion||null},${stock},${Number(b.stock_minimo||0)},${Number(b.costo||0)},${b.proveedor||null},'Activo',${createdBy||null})`;
          if (stock>0) await sql`INSERT INTO movimientos(tipo,sku,articulo,cantidad,stock_anterior,stock_resultante,usuario,observacion,fecha,hora)VALUES('ENTRADA',${s},${b.nombre},${stock},0,${stock},${createdBy||'Sistema'},'Stock inicial - importación masiva',${fecha},${hora})`;
          created++;
        }
      }
      if (modo==='sincronizacion_total') {
        const skus = items.map(i=>i.sku?.toUpperCase()).filter(Boolean);
        if (skus.length) { await sql`UPDATE articulos SET estado='Inactivo' WHERE sku != ALL(${skus}) AND estado='Activo'`; deactivated++; }
      }
      return res.json({ ok:true, created, updated, deactivated });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── POST deactivate ────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'deactivate') {
    const { skus } = req.body || {};
    if (!skus?.length) return res.status(400).json({ error: 'skus requerido' });
    try {
      await sql`UPDATE articulos SET estado='Inactivo',updated_at=NOW() WHERE sku=ANY(${skus})`;
      return res.json({ ok:true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── POST create single ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.sku || !b.nombre) return res.status(400).json({ error: 'sku y nombre requeridos' });
    const s = b.sku.trim().toUpperCase();
    try {
      const rows = await sql`INSERT INTO articulos(sku,nombre,descripcion,categoria,marca,unidad,ubicacion,stock,stock_minimo,stock_maximo,costo,proveedor,estado)VALUES(${s},${b.nombre},${b.descripcion||null},${b.categoria||null},${b.marca||null},${b.unidad||'UND'},${b.ubicacion||null},${Number(b.stock||0)},${Number(b.stock_minimo||0)},${b.stock_maximo?Number(b.stock_maximo):null},${Number(b.costo||0)},${b.proveedor||null},'Activo')RETURNING*`;
      return res.status(201).json(rows[0]);
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── PUT update by sku ──────────────────────────────────────────────────
  if (req.method === 'PUT') {
    if (!sku) return res.status(400).json({ error: 'sku requerido' });
    const b = req.body || {};
    try {
      const rows = await sql`UPDATE articulos SET nombre=COALESCE(${b.nombre||null},nombre),descripcion=COALESCE(${b.descripcion!==undefined?b.descripcion:null},descripcion),categoria=COALESCE(${b.categoria||null},categoria),marca=COALESCE(${b.marca||null},marca),unidad=COALESCE(${b.unidad||null},unidad),ubicacion=COALESCE(${b.ubicacion||null},ubicacion),ubicacion_label=COALESCE(${b.ubicacion_label||null},ubicacion_label),stock_minimo=COALESCE(${b.stock_minimo!=null?Number(b.stock_minimo):null},stock_minimo),costo=COALESCE(${b.costo!=null?Number(b.costo):null},costo),proveedor=COALESCE(${b.proveedor||null},proveedor),updated_at=NOW() WHERE sku=${sku} RETURNING*`;
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
      return res.json(rows[0]);
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── DELETE ─────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!sku) return res.status(400).json({ error: 'sku requerido' });
    try {
      await sql`DELETE FROM articulos WHERE sku=${sku}`;
      return res.json({ ok:true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  res.status(405).end();
};
