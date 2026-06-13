// api/articulos/index.js  — GET list, POST create
const { sql, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET /api/articulos
  if (req.method === 'GET') {
    try {
      const search = req.query.search || '';
      let rows;
      if (search) {
        rows = (await sql`
          SELECT * FROM articulos
          WHERE sku ILIKE ${'%'+search+'%'}
             OR nombre ILIKE ${'%'+search+'%'}
             OR categoria ILIKE ${'%'+search+'%'}
             OR ubicacion ILIKE ${'%'+search+'%'}
             OR proveedor ILIKE ${'%'+search+'%'}
          ORDER BY nombre LIMIT 500`).rows;
      } else {
        rows = (await sql`SELECT * FROM articulos ORDER BY nombre LIMIT 500`).rows;
      }
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/articulos
  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.sku || !b.nombre) return res.status(400).json({ error: 'SKU y nombre son obligatorios' });
    try {
      const { rows } = await sql`
        INSERT INTO articulos
          (id, sku, nombre, descripcion, categoria, marca, unidad,
           ubicacion, ubicacion_label, bodega_id,
           stock, stock_minimo, stock_maximo, costo, proveedor, created_by)
        VALUES (
          ${b.id || null},
          ${b.sku.toUpperCase()}, ${b.nombre},
          ${b.descripcion || null}, ${b.categoria || null}, ${b.marca || null},
          ${b.unidad || 'UND'},
          ${b.ubicacion || null}, ${b.ubicacion_label || null}, ${b.bodega_id || null},
          ${Number(b.stock) || 0}, ${Number(b.stock_minimo) || 0},
          ${b.stock_maximo ? Number(b.stock_maximo) : null},
          ${Number(b.costo) || 0}, ${b.proveedor || null}, ${b.created_by || null}
        )
        ON CONFLICT (sku) DO NOTHING
        RETURNING *`;

      if (!rows[0]) return res.status(409).json({ error: 'SKU ya existe' });
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'SKU ya existe' });
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
