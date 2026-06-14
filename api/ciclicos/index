// api/ciclicos/index.js — Inventarios Cíclicos sync across devices
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS ciclicos (
      id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      codigo       TEXT NOT NULL,
      nombre       TEXT NOT NULL,
      tipo         TEXT DEFAULT 'CICLICO',
      fecha        TEXT,
      hora         TEXT,
      bodega       TEXT,
      responsable  TEXT,
      observacion  TEXT,
      estado       TEXT DEFAULT 'PROGRAMADO',
      creado_por   TEXT,
      creado_en    TIMESTAMPTZ DEFAULT NOW(),
      iniciado_en  TIMESTAMPTZ,
      finalizado_en TIMESTAMPTZ,
      cerrado_en   TIMESTAMPTZ,
      cancelado_en TIMESTAMPTZ,
      conteo       JSONB DEFAULT '[]',
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(()=>{});

  // GET — list all
  if (req.method === 'GET') {
    try {
      const { responsable } = req.query;
      let rows;
      if (responsable) {
        rows = await sql`
          SELECT * FROM ciclicos
          WHERE responsable = ${responsable}
          ORDER BY creado_en DESC`;
      } else {
        rows = await sql`SELECT * FROM ciclicos ORDER BY creado_en DESC`;
      }
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create or update
  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.codigo || !b.nombre) return res.status(400).json({ error: 'codigo y nombre requeridos' });
    try {
      const rows = await sql`
        INSERT INTO ciclicos
          (id, codigo, nombre, tipo, fecha, hora, bodega, responsable,
           observacion, estado, creado_por, creado_en,
           iniciado_en, finalizado_en, cerrado_en, cancelado_en, conteo)
        VALUES (
          ${b.id || null}, ${b.codigo}, ${b.nombre}, ${b.tipo||'CICLICO'},
          ${b.fecha||null}, ${b.hora||null}, ${b.bodega||null}, ${b.responsable||null},
          ${b.observacion||null}, ${b.estado||'PROGRAMADO'}, ${b.creado_por||null},
          ${b.creado_en||null},
          ${b.iniciado_en||null}, ${b.finalizado_en||null},
          ${b.cerrado_en||null},  ${b.cancelado_en||null},
          ${JSON.stringify(b.conteo||[])}
        )
        ON CONFLICT (id) DO UPDATE SET
          nombre       = EXCLUDED.nombre,
          tipo         = EXCLUDED.tipo,
          fecha        = EXCLUDED.fecha,
          hora         = EXCLUDED.hora,
          bodega       = EXCLUDED.bodega,
          responsable  = EXCLUDED.responsable,
          observacion  = EXCLUDED.observacion,
          estado       = EXCLUDED.estado,
          iniciado_en  = EXCLUDED.iniciado_en,
          finalizado_en= EXCLUDED.finalizado_en,
          cerrado_en   = EXCLUDED.cerrado_en,
          cancelado_en = EXCLUDED.cancelado_en,
          conteo       = EXCLUDED.conteo,
          updated_at   = NOW()
        RETURNING *`;
      return res.status(201).json({ ok: true, data: rows[0] });
    } catch (err) {
      console.error('[ciclicos POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requerido' });
    try {
      await sql`DELETE FROM ciclicos WHERE id = ${id}`;
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
