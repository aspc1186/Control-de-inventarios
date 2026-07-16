// api/proveedores/index.js - StockFlow WMS suppliers API
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

async function ensureProveedores(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS proveedores (
      id TEXT PRIMARY KEY,
      nombre TEXT,
      nit TEXT,
      contacto TEXT,
      telefono TEXT,
      correo TEXT,
      direccion TEXT,
      ciudad TEXT,
      pais TEXT DEFAULT 'Colombia',
      estado TEXT DEFAULT 'ACTIVO',
      empresa_id TEXT,
      notas TEXT,
      categoria TEXT,
      lead_time_dias INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS id TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nit TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contacto TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS telefono TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS correo TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS direccion TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ciudad TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'Colombia'`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ACTIVO'`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS notas TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS categoria TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS lead_time_dias INTEGER`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
}

async function saveProveedor(sql, p, empresaId) {
  const incomingId = text(p.id);
  const id = isUuid(incomingId) ? incomingId : randomUUID();
  const incomingEmpresaId = text(p.empresa_id) || empresaId;
  const payload = {
    id,
    nombre: text(p.nombre),
    nit: text(p.nit),
    contacto: text(p.contacto),
    telefono: text(p.telefono),
    correo: text(p.correo),
    direccion: text(p.direccion),
    ciudad: text(p.ciudad),
    pais: text(p.pais, 'Colombia'),
    estado: text(p.estado, 'ACTIVO'),
    empresa_id: isUuid(incomingEmpresaId) ? incomingEmpresaId : randomUUID(),
    notas: text(p.notas),
    categoria: text(p.categoria),
    lead_time_dias: p.lead_time_dias === undefined || p.lead_time_dias === null || p.lead_time_dias === ''
      ? null
      : Number(p.lead_time_dias)
  };

  const existing = await sql`SELECT id FROM proveedores WHERE id = ${id} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE proveedores SET
        nombre=${payload.nombre}, nit=${payload.nit}, contacto=${payload.contacto},
        telefono=${payload.telefono}, correo=${payload.correo}, direccion=${payload.direccion},
        ciudad=${payload.ciudad}, pais=${payload.pais}, estado=${payload.estado},
        empresa_id=${payload.empresa_id}, notas=${payload.notas}, categoria=${payload.categoria},
        lead_time_dias=${payload.lead_time_dias}, updated_at=NOW()
      WHERE id=${id}`;
    return { id, updated: true };
  }

  await sql`
    INSERT INTO proveedores (
      id, nombre, nit, contacto, telefono, correo, direccion, ciudad, pais,
      estado, empresa_id, notas, categoria, lead_time_dias, created_at, updated_at
    ) VALUES (
      ${payload.id}, ${payload.nombre}, ${payload.nit}, ${payload.contacto},
      ${payload.telefono}, ${payload.correo}, ${payload.direccion}, ${payload.ciudad},
      ${payload.pais}, ${payload.estado}, ${payload.empresa_id}, ${payload.notas},
      ${payload.categoria}, ${payload.lead_time_dias}, NOW(), NOW()
    )`;
  return { id, inserted: true };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  const empresaId = req.query.empresa_id || null;

  try {
    await ensureProveedores(sql);

    if (req.method === 'GET') {
      const rows = empresaId && empresaId !== '__SA__'
        ? await sql`SELECT * FROM proveedores WHERE empresa_id = ${empresaId} ORDER BY nombre ASC`
        : await sql`SELECT * FROM proveedores ORDER BY nombre ASC`;
      return res.status(200).json({ ok: true, data: rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const items = Array.isArray(body) ? body : [body];
      if (!items.length) return res.status(200).json({ ok: true, count: 0 });

      if (Array.isArray(body) && empresaId) {
        await sql`UPDATE proveedores SET estado = 'INACTIVO', updated_at = NOW() WHERE empresa_id = ${empresaId}`;
      }

      const results = [];
      for (const item of items) results.push(await saveProveedor(sql, item, empresaId));
      return res.status(200).json({
        ok: true,
        count: results.length,
        inserted: results.filter(r => r.inserted).length,
        updated: results.filter(r => r.updated).length,
        id: results.length === 1 ? results[0].id : undefined
      });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      if (!body.id) return res.status(400).json({ ok: false, error: 'id requerido' });
      const result = await saveProveedor(sql, body, empresaId);
      return res.status(200).json({ ok: true, id: result.id });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
      if (!isUuid(id)) return res.status(200).json({ ok: true, skipped: true });
      await sql`UPDATE proveedores SET estado = 'INACTIVO', updated_at = NOW() WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API proveedores error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
