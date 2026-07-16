// api/empresas/index.js - StockFlow cloud companies API
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

async function ensureEmpresas(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS empresas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      nit TEXT,
      correo TEXT,
      ciudad TEXT,
      plan TEXT DEFAULT 'FREE',
      estado TEXT DEFAULT 'ACTIVO',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nit TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS correo TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ciudad TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'FREE'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ACTIVO'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;

  await sql`
    INSERT INTO empresas (id, nombre, nit, plan, estado)
    SELECT '00000000-0000-4000-8000-000000000001'::uuid, 'Empresa Principal', 'N/A', 'WMS', 'ACTIVO'
    WHERE NOT EXISTS (SELECT 1 FROM empresas)`;
}

async function saveEmpresa(sql, body) {
  const incomingId = text(body.id);
  const id = isUuid(incomingId) ? incomingId : randomUUID();
  const payload = {
    id,
    nombre: text(body.nombre, 'Empresa sin nombre'),
    nit: text(body.nit),
    correo: text(body.correo),
    ciudad: text(body.ciudad),
    plan: text(body.plan, 'FREE'),
    estado: text(body.estado, 'ACTIVO')
  };

  const existing = await sql`SELECT id FROM empresas WHERE id = ${id} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE empresas SET
        nombre=${payload.nombre}, nit=${payload.nit}, correo=${payload.correo},
        ciudad=${payload.ciudad}, plan=${payload.plan}, estado=${payload.estado},
        updated_at=NOW()
      WHERE id=${id}`;
    return { id, updated: true };
  }

  await sql`
    INSERT INTO empresas (id, nombre, nit, correo, ciudad, plan, estado, created_at, updated_at)
    VALUES (${payload.id}, ${payload.nombre}, ${payload.nit}, ${payload.correo},
            ${payload.ciudad}, ${payload.plan}, ${payload.estado}, NOW(), NOW())`;
  return { id, inserted: true };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  try {
    await ensureEmpresas(sql);

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM empresas ORDER BY nombre ASC`;
      return res.status(200).json({ ok: true, data: rows, total: rows.length });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const result = await saveEmpresa(sql, req.body || {});
      return res.status(200).json({ ok: true, ...result });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'id uuid requerido' });
      await sql`UPDATE empresas SET estado='INACTIVO', updated_at=NOW() WHERE id=${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API empresas error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
