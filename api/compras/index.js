// api/compras/index.js - Purchase orders API
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

async function ensureCompras(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS compras (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      numero TEXT,
      proveedor TEXT,
      proveedor_id TEXT,
      estado TEXT DEFAULT 'BORRADOR',
      total NUMERIC(14,2) DEFAULT 0,
      items JSONB DEFAULT '[]',
      observaciones TEXT,
      empresa_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS proveedor TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS proveedor_id TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'BORRADOR'`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS total NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS observaciones TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    sku: text(it.sku, ''),
    nombre: text(it.nombre, ''),
    cantidad: Number(it.cantidad || 0),
    costo: Number(it.costo || 0),
    total: Number(it.total || (Number(it.cantidad || 0) * Number(it.costo || 0)))
  })).filter((it) => it.sku && it.cantidad > 0);
}

async function saveOrden(sql, body) {
  const items = normalizeItems(body.items);
  const total = body.total === undefined || body.total === null || body.total === ''
    ? items.reduce((sum, it) => sum + Number(it.total || 0), 0)
    : Number(body.total || 0);
  const id = text(body.id) || randomUUID();
  const payload = {
    id,
    numero: text(body.numero) || `OC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`,
    proveedor: text(body.proveedor),
    proveedor_id: text(body.proveedor_id),
    estado: text(body.estado, 'BORRADOR'),
    total,
    items,
    observaciones: text(body.observaciones),
    empresa_id: text(body.empresa_id)
  };

  const existing = await sql`SELECT id FROM compras WHERE id = ${id} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE compras SET
        numero=${payload.numero}, proveedor=${payload.proveedor}, proveedor_id=${payload.proveedor_id},
        estado=${payload.estado}, total=${payload.total}, items=${JSON.stringify(payload.items)}::jsonb,
        observaciones=${payload.observaciones}, empresa_id=${payload.empresa_id}, updated_at=NOW()
      WHERE id=${id}`;
    return { id, updated: true, numero: payload.numero };
  }

  await sql`
    INSERT INTO compras (id, numero, proveedor, proveedor_id, estado, total, items, observaciones, empresa_id, created_at, updated_at)
    VALUES (${payload.id}, ${payload.numero}, ${payload.proveedor}, ${payload.proveedor_id}, ${payload.estado},
            ${payload.total}, ${JSON.stringify(payload.items)}::jsonb, ${payload.observaciones}, ${payload.empresa_id}, NOW(), NOW())`;
  return { id, inserted: true, numero: payload.numero };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  try {
    await ensureCompras(sql);

    if (req.method === 'GET') {
      const { empresa_id } = req.query;
      const rows = empresa_id && empresa_id !== '__SA__'
        ? await sql`SELECT * FROM compras WHERE empresa_id = ${empresa_id} ORDER BY created_at DESC LIMIT 1000`
        : await sql`SELECT * FROM compras ORDER BY created_at DESC LIMIT 1000`;
      return res.status(200).json({ ok: true, data: rows, total: rows.length });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const result = await saveOrden(sql, req.body || {});
      return res.status(200).json({ ok: true, ...result });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
      await sql`UPDATE compras SET estado='ANULADA', updated_at=NOW() WHERE id=${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API compras error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
