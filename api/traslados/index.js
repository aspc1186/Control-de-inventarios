// api/traslados/index.js - Internal stock transfers API
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

async function ensureTraslados(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS traslados (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sku TEXT NOT NULL,
      nombre TEXT,
      cantidad NUMERIC(12,2) NOT NULL,
      origen TEXT,
      destino TEXT,
      usuario TEXT,
      observacion TEXT,
      empresa_id TEXT,
      fecha TEXT,
      hora TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS origen TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS destino TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS usuario TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS observacion TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS fecha TEXT`;
  await sql`ALTER TABLE traslados ADD COLUMN IF NOT EXISTS hora TEXT`;
}

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString('es-CO', { year:'numeric', month:'2-digit', day:'2-digit' }),
    hora: d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  try {
    await ensureTraslados(sql);

    if (req.method === 'GET') {
      const { empresa_id, limit = 1000 } = req.query;
      const lim = Math.min(Number(limit) || 1000, 5000);
      const rows = empresa_id && empresa_id !== '__SA__'
        ? await sql`SELECT * FROM traslados WHERE empresa_id = ${empresa_id} ORDER BY created_at DESC LIMIT ${lim}`
        : await sql`SELECT * FROM traslados ORDER BY created_at DESC LIMIT ${lim}`;
      return res.status(200).json({ ok: true, data: rows, total: rows.length });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.sku) return res.status(400).json({ ok: false, error: 'sku requerido' });
      const qty = Number(body.cantidad || 0);
      if (!qty || qty <= 0) return res.status(400).json({ ok: false, error: 'cantidad debe ser > 0' });
      const t = nowParts();
      const id = text(body.id) || randomUUID();
      const rows = await sql`
        INSERT INTO traslados (id, sku, nombre, cantidad, origen, destino, usuario, observacion, empresa_id, fecha, hora, created_at)
        VALUES (
          ${id}, ${text(body.sku).toUpperCase()}, ${text(body.nombre)}, ${qty},
          ${text(body.origen)}, ${text(body.destino)}, ${text(body.usuario, 'Sistema')},
          ${text(body.observacion)}, ${text(body.empresa_id)}, ${text(body.fecha, t.fecha)},
          ${text(body.hora, t.hora)}, NOW()
        )
        RETURNING *`;
      return res.status(200).json({ ok: true, id: rows[0].id, data: rows[0] });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API traslados error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
