// api/clientes/index.js - StockFlow WMS customers API
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

async function ensureClientes(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nit TEXT,
      nombre TEXT,
      razon_social TEXT,
      nombre_comercial TEXT,
      tipo_cliente TEXT,
      contacto TEXT,
      cargo TEXT,
      telefono TEXT,
      celular TEXT,
      whatsapp TEXT,
      correo TEXT,
      correo_facturacion TEXT,
      pais TEXT DEFAULT 'Colombia',
      departamento TEXT,
      ciudad TEXT,
      direccion TEXT,
      condicion_pago TEXT,
      cupo_credito NUMERIC,
      vendedor TEXT,
      estado TEXT DEFAULT 'ACTIVO',
      observaciones TEXT,
      origen_registro TEXT,
      empresa_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nit TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS razon_social TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre_comercial TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_cliente TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cargo TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS celular TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS whatsapp TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS correo TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS correo_facturacion TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'Colombia'`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS departamento TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ciudad TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS condicion_pago TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cupo_credito NUMERIC`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vendedor TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ACTIVO'`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS observaciones TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS origen_registro TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
}

async function resolveEmpresa(sql, item, empresaId) {
  const incoming = text(item.empresa_id) || text(empresaId);
  if (isUuid(incoming)) return incoming;
  const empresas = await sql`SELECT id FROM empresas LIMIT 1`.catch(() => []);
  return empresas[0] && empresas[0].id ? String(empresas[0].id) : null;
}

async function saveCliente(sql, c, empresaId) {
  const id = text(c.id) || randomUUID();
  const resolvedEmpresaId = await resolveEmpresa(sql, c, empresaId);
  if (!resolvedEmpresaId) throw new Error('No hay empresa_id valido para asociar el cliente.');

  const payload = {
    id,
    nit: text(c.nit),
    nombre: text(c.nombre) || text(c.razon_social),
    razon_social: text(c.razon_social) || text(c.nombre),
    nombre_comercial: text(c.nombre_comercial),
    tipo_cliente: text(c.tipo_cliente),
    contacto: text(c.contacto),
    cargo: text(c.cargo),
    telefono: text(c.telefono),
    celular: text(c.celular),
    whatsapp: text(c.whatsapp),
    correo: text(c.correo),
    correo_facturacion: text(c.correo_facturacion),
    pais: text(c.pais, 'Colombia'),
    departamento: text(c.departamento),
    ciudad: text(c.ciudad),
    direccion: text(c.direccion),
    condicion_pago: text(c.condicion_pago),
    cupo_credito: c.cupo_credito === undefined || c.cupo_credito === null || c.cupo_credito === '' ? null : Number(c.cupo_credito),
    vendedor: text(c.vendedor),
    estado: text(c.estado, 'ACTIVO'),
    observaciones: text(c.observaciones),
    origen_registro: text(c.origen_registro, 'MANUAL'),
    empresa_id: resolvedEmpresaId
  };

  const existing = await sql`SELECT id FROM clientes WHERE id = ${id} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE clientes SET
        nit=${payload.nit}, nombre=${payload.nombre}, razon_social=${payload.razon_social},
        nombre_comercial=${payload.nombre_comercial}, tipo_cliente=${payload.tipo_cliente},
        contacto=${payload.contacto}, cargo=${payload.cargo}, telefono=${payload.telefono},
        celular=${payload.celular}, whatsapp=${payload.whatsapp}, correo=${payload.correo},
        correo_facturacion=${payload.correo_facturacion}, pais=${payload.pais},
        departamento=${payload.departamento}, ciudad=${payload.ciudad}, direccion=${payload.direccion},
        condicion_pago=${payload.condicion_pago}, cupo_credito=${payload.cupo_credito},
        vendedor=${payload.vendedor}, estado=${payload.estado}, observaciones=${payload.observaciones},
        origen_registro=${payload.origen_registro}, empresa_id=${payload.empresa_id}, updated_at=NOW()
      WHERE id=${id}`;
    return { id, updated: true };
  }

  await sql`
    INSERT INTO clientes (
      id, nit, nombre, razon_social, nombre_comercial, tipo_cliente, contacto, cargo,
      telefono, celular, whatsapp, correo, correo_facturacion, pais, departamento,
      ciudad, direccion, condicion_pago, cupo_credito, vendedor, estado,
      observaciones, origen_registro, empresa_id, created_at, updated_at
    ) VALUES (
      ${payload.id}, ${payload.nit}, ${payload.nombre}, ${payload.razon_social},
      ${payload.nombre_comercial}, ${payload.tipo_cliente}, ${payload.contacto}, ${payload.cargo},
      ${payload.telefono}, ${payload.celular}, ${payload.whatsapp}, ${payload.correo},
      ${payload.correo_facturacion}, ${payload.pais}, ${payload.departamento}, ${payload.ciudad},
      ${payload.direccion}, ${payload.condicion_pago}, ${payload.cupo_credito}, ${payload.vendedor},
      ${payload.estado}, ${payload.observaciones}, ${payload.origen_registro}, ${payload.empresa_id},
      NOW(), NOW()
    )`;
  return { id, inserted: true };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  const empresaId = req.query.empresa_id || null;

  try {
    await ensureClientes(sql);

    if (req.method === 'GET') {
      const rows = empresaId && empresaId !== '__SA__'
        ? await sql`SELECT * FROM clientes WHERE empresa_id = ${empresaId} ORDER BY razon_social ASC`
        : await sql`SELECT * FROM clientes ORDER BY razon_social ASC`;
      return res.status(200).json({ ok: true, data: rows });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body || {};
      const items = Array.isArray(body) ? body : [body];
      const results = [];
      for (const item of items) results.push(await saveCliente(sql, item, empresaId));
      return res.status(200).json({
        ok: true,
        count: results.length,
        inserted: results.filter(r => r.inserted).length,
        updated: results.filter(r => r.updated).length,
        id: results.length === 1 ? results[0].id : undefined
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
      await sql`UPDATE clientes SET estado = 'INACTIVO', updated_at = NOW() WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('API clientes error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
