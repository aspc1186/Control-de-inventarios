// api/proveedores/index.js — CRUD de proveedores
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS proveedores (
      id            SERIAL PRIMARY KEY,
      codigo        TEXT,
      nit           TEXT,
      razon_social  TEXT NOT NULL,
      nombre_comercial TEXT,
      contacto      TEXT,
      telefono      TEXT,
      whatsapp      TEXT,
      correo        TEXT,
      direccion     TEXT,
      ciudad        TEXT,
      pais          TEXT DEFAULT 'Colombia',
      estado        TEXT DEFAULT 'Activo',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {});

  // GET — list all
  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM proveedores ORDER BY razon_social`;
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create or update
  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.razon_social) return res.status(400).json({ error: 'Razón Social es requerida' });
    try {
      const rows = await sql`
        INSERT INTO proveedores
          (codigo, nit, razon_social, nombre_comercial, contacto, telefono,
           whatsapp, correo, direccion, ciudad, pais, estado, updated_at)
        VALUES (
          ${b.codigo||null}, ${b.nit||null}, ${b.razon_social}, ${b.nombre_comercial||null},
          ${b.contacto||null}, ${b.telefono||null}, ${b.whatsapp||null}, ${b.correo||null},
          ${b.direccion||null}, ${b.ciudad||null}, ${b.pais||'Colombia'}, ${b.estado||'Activo'},
          NOW()
        )
        ON CONFLICT (nit) DO UPDATE SET
          razon_social = EXCLUDED.razon_social,
          nombre_comercial = EXCLUDED.nombre_comercial,
          contacto = EXCLUDED.contacto,
          telefono = EXCLUDED.telefono,
          correo   = EXCLUDED.correo,
          ciudad   = EXCLUDED.ciudad,
          estado   = EXCLUDED.estado,
          updated_at = NOW()
        RETURNING *`;
      return res.status(201).json({ ok: true, data: rows[0] });
    } catch (err) {
      // If no UNIQUE on nit, just insert
      try {
        const rows2 = await sql`
          INSERT INTO proveedores
            (codigo, nit, razon_social, nombre_comercial, contacto, telefono,
             whatsapp, correo, direccion, ciudad, pais, estado)
          VALUES (
            ${b.codigo||null}, ${b.nit||null}, ${b.razon_social}, ${b.nombre_comercial||null},
            ${b.contacto||null}, ${b.telefono||null}, ${b.whatsapp||null}, ${b.correo||null},
            ${b.direccion||null}, ${b.ciudad||null}, ${b.pais||'Colombia'}, ${b.estado||'Activo'}
          ) RETURNING *`;
        return res.status(201).json({ ok: true, data: rows2[0] });
      } catch (err2) {
        return res.status(500).json({ error: err2.message });
      }
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requerido' });
    try {
      await sql`DELETE FROM proveedores WHERE id = ${Number(id)}`;
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
