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
      ubicaciones   JSONB DEFAULT '[]',
      ubic_estados  JSONB DEFAULT '{}',
      asignaciones  JSONB DEFAULT '[]',
      multi_usuario BOOLEAN DEFAULT FALSE,
      blind_mode    BOOLEAN DEFAULT TRUE,
      double_count  BOOLEAN DEFAULT FALSE,
      movement_policy TEXT DEFAULT 'LOCK_LOCATIONS',
      tolerance     NUMERIC(12,4) DEFAULT 0,
      prioridad     TEXT DEFAULT 'NORMAL',
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS ubicaciones JSONB DEFAULT '[]'`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS ubic_estados JSONB DEFAULT '{}'`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS asignaciones JSONB DEFAULT '[]'`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS multi_usuario BOOLEAN DEFAULT FALSE`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS blind_mode BOOLEAN DEFAULT TRUE`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS double_count BOOLEAN DEFAULT FALSE`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS movement_policy TEXT DEFAULT 'LOCK_LOCATIONS'`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS tolerance NUMERIC(12,4) DEFAULT 0`.catch(()=>{});
  await sql`ALTER TABLE ciclicos ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'NORMAL'`.catch(()=>{});

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
           iniciado_en, finalizado_en, cerrado_en, cancelado_en, conteo,
           ubicaciones, ubic_estados, asignaciones, multi_usuario, blind_mode,
           double_count, movement_policy, tolerance, prioridad)
        VALUES (
          ${b.id || null}, ${b.codigo}, ${b.nombre}, ${b.tipo||'CICLICO'},
          ${b.fecha||null}, ${b.hora||null}, ${b.bodega||null}, ${b.responsable||null},
          ${b.observacion||null}, ${b.estado||'PROGRAMADO'}, ${b.creado_por||null},
          ${b.creado_en||null},
          ${b.iniciado_en||null}, ${b.finalizado_en||null},
          ${b.cerrado_en||null},  ${b.cancelado_en||null},
          ${JSON.stringify(b.conteo||[])},
          ${JSON.stringify(b.ubicaciones||[])},
          ${JSON.stringify(b.ubicEstados||b.ubic_estados||{})},
          ${JSON.stringify(b.asignaciones||b.assignments||[])},
          ${!!(b.multiUsuario||b.multi_usuario)},
          ${b.blindMode !== false && b.blind_mode !== false},
          ${!!(b.doubleCount||b.double_count)},
          ${b.movementPolicy||b.movement_policy||'LOCK_LOCATIONS'},
          ${Number(b.tolerance||b.tolerancia||0)},
          ${b.prioridad||b.priority||'NORMAL'}
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
          ubicaciones  = EXCLUDED.ubicaciones,
          ubic_estados = EXCLUDED.ubic_estados,
          asignaciones = EXCLUDED.asignaciones,
          multi_usuario= EXCLUDED.multi_usuario,
          blind_mode   = EXCLUDED.blind_mode,
          double_count = EXCLUDED.double_count,
          movement_policy = EXCLUDED.movement_policy,
          tolerance    = EXCLUDED.tolerance,
          prioridad    = EXCLUDED.prioridad,
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
