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
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS razon_social TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nombre_comercial TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tipo_proveedor TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS marca TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cargo TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS celular TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS whatsapp TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS correo_cartera TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS sitio_web TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS departamento TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS condicion_pago TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS descuento NUMERIC`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tiempo_entrega INTEGER`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS banco TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tipo_cuenta TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS numero_cuenta TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS observaciones TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS origen_registro TEXT`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
}

async function saveProveedor(sql, p, empresaId) {
  const incomingId = text(p.id);
  const id = isUuid(incomingId) ? incomingId : randomUUID();
  const incomingEmpresaId = text(p.empresa_id) || empresaId;
  let resolvedEmpresaId = isUuid(incomingEmpresaId) ? incomingEmpresaId : null;
  if (!resolvedEmpresaId) {
    const empresas = await sql`SELECT id FROM empresas LIMIT 1`.catch(() => []);
    resolvedEmpresaId = empresas[0] && empresas[0].id ? String(empresas[0].id) : null;
  }
  if (!resolvedEmpresaId) {
    throw new Error('No hay empresa_id valido para asociar el proveedor. Crea o selecciona una empresa antes de registrar proveedores.');
  }
  const payload = {
    id,
    nombre: text(p.nombre) || text(p.razon_social),
    nit: text(p.nit),
    contacto: text(p.contacto),
    telefono: text(p.telefono),
    correo: text(p.correo),
    direccion: text(p.direccion),
    ciudad: text(p.ciudad),
    pais: text(p.pais, 'Colombia'),
    estado: text(p.estado, 'ACTIVO'),
    empresa_id: resolvedEmpresaId,
    notas: text(p.notas),
    categoria: text(p.categoria),
    lead_time_dias: p.lead_time_dias === undefined || p.lead_time_dias === null || p.lead_time_dias === ''
      ? null
      : Number(p.lead_time_dias),
    razon_social: text(p.razon_social) || text(p.nombre),
    nombre_comercial: text(p.nombre_comercial),
    tipo_proveedor: text(p.tipo_proveedor),
    marca: text(p.marca),
    cargo: text(p.cargo),
    celular: text(p.celular),
    whatsapp: text(p.whatsapp),
    correo_cartera: text(p.correo_cartera),
    sitio_web: text(p.sitio_web),
    departamento: text(p.departamento),
    condicion_pago: text(p.condicion_pago),
    descuento: p.descuento === undefined || p.descuento === null || p.descuento === '' ? null : Number(p.descuento),
    tiempo_entrega: p.tiempo_entrega === undefined || p.tiempo_entrega === null || p.tiempo_entrega === '' ? null : Number(p.tiempo_entrega),
    banco: text(p.banco),
    tipo_cuenta: text(p.tipo_cuenta),
    numero_cuenta: text(p.numero_cuenta),
    observaciones: text(p.observaciones),
    origen_registro: text(p.origen_registro, 'MANUAL')
  };

  const existing = await sql`SELECT id FROM proveedores WHERE id = ${id} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE proveedores SET
        nombre=${payload.nombre}, nit=${payload.nit}, contacto=${payload.contacto},
        telefono=${payload.telefono}, correo=${payload.correo}, direccion=${payload.direccion},
        ciudad=${payload.ciudad}, pais=${payload.pais}, estado=${payload.estado},
        empresa_id=${payload.empresa_id}, notas=${payload.notas}, categoria=${payload.categoria},
        lead_time_dias=${payload.lead_time_dias}, razon_social=${payload.razon_social},
        nombre_comercial=${payload.nombre_comercial}, tipo_proveedor=${payload.tipo_proveedor},
        marca=${payload.marca}, cargo=${payload.cargo}, celular=${payload.celular},
        whatsapp=${payload.whatsapp}, correo_cartera=${payload.correo_cartera},
        sitio_web=${payload.sitio_web}, departamento=${payload.departamento},
        condicion_pago=${payload.condicion_pago}, descuento=${payload.descuento},
        tiempo_entrega=${payload.tiempo_entrega}, banco=${payload.banco},
        tipo_cuenta=${payload.tipo_cuenta}, numero_cuenta=${payload.numero_cuenta},
        observaciones=${payload.observaciones}, origen_registro=${payload.origen_registro},
        updated_at=NOW()
      WHERE id=${id}`;
    return { id, updated: true };
  }

  await sql`
    INSERT INTO proveedores (
      id, nombre, nit, contacto, telefono, correo, direccion, ciudad, pais,
      estado, empresa_id, notas, categoria, lead_time_dias, razon_social,
      nombre_comercial, tipo_proveedor, marca, cargo, celular, whatsapp,
      correo_cartera, sitio_web, departamento, condicion_pago, descuento,
      tiempo_entrega, banco, tipo_cuenta, numero_cuenta, observaciones,
      origen_registro, created_at, updated_at
    ) VALUES (
      ${payload.id}, ${payload.nombre}, ${payload.nit}, ${payload.contacto},
      ${payload.telefono}, ${payload.correo}, ${payload.direccion}, ${payload.ciudad},
      ${payload.pais}, ${payload.estado}, ${payload.empresa_id}, ${payload.notas},
      ${payload.categoria}, ${payload.lead_time_dias}, ${payload.razon_social},
      ${payload.nombre_comercial}, ${payload.tipo_proveedor}, ${payload.marca},
      ${payload.cargo}, ${payload.celular}, ${payload.whatsapp}, ${payload.correo_cartera},
      ${payload.sitio_web}, ${payload.departamento}, ${payload.condicion_pago},
      ${payload.descuento}, ${payload.tiempo_entrega}, ${payload.banco},
      ${payload.tipo_cuenta}, ${payload.numero_cuenta}, ${payload.observaciones},
      ${payload.origen_registro}, NOW(), NOW()
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
