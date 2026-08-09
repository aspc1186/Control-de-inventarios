// api/empresas/index.js - StockFlow cloud companies API
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');
const {
  INDUSTRY_CONFIGS,
  MODULE_REGISTRY,
  PLAN_MODULES,
  normalizeIndustry,
  normalizePlan,
  resolveCompanyConfig,
} = require('../../lib/industry');

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

function jsonArray(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function jsonObject(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (!v) return {};
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function ensureEmpresas(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS empresas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      slug TEXT,
      nit TEXT,
      correo TEXT,
      ciudad TEXT,
      plan TEXT DEFAULT 'FREE',
      industry_type TEXT DEFAULT 'GENERIC',
      sector TEXT,
      subsector TEXT,
      pais TEXT DEFAULT 'Colombia',
      moneda TEXT DEFAULT 'COP',
      timezone TEXT DEFAULT 'America/Bogota',
      settings JSONB DEFAULT '{}',
      modules_enabled JSONB DEFAULT '[]',
      features_enabled JSONB DEFAULT '[]',
      estado TEXT DEFAULT 'ACTIVO',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS slug TEXT`;
  await sql`ALTER TABLE empresas ALTER COLUMN slug SET DEFAULT 'empresa-principal'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nit TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS correo TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ciudad TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'FREE'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS industry_type TEXT DEFAULT 'GENERIC'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS sector TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS subsector TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'Colombia'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'COP'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Bogota'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modules_enabled JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS features_enabled JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ACTIVO'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`UPDATE empresas SET industry_type='GENERIC' WHERE industry_type IS NULL OR industry_type=''`;

  await sql`
    INSERT INTO empresas (id, nombre, slug, nit, plan, estado)
    SELECT '00000000-0000-4000-8000-000000000001'::uuid, 'Empresa Principal', 'empresa-principal', 'N/A', 'WMS', 'ACTIVO'
    WHERE NOT EXISTS (SELECT 1 FROM empresas)`;
}

async function saveEmpresa(sql, body) {
  const incomingId = text(body.id);
  const id = isUuid(incomingId) ? incomingId : randomUUID();
  const payload = {
    id,
    nombre: text(body.nombre, 'Empresa sin nombre'),
    slug: text(body.slug) || text(body.nombre, 'empresa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa',
    nit: text(body.nit),
    correo: text(body.correo),
    ciudad: text(body.ciudad),
    plan: normalizePlan(text(body.plan, 'FREE')),
    industry_type: normalizeIndustry(text(body.industry_type || body.tipo_industria || body.tipo, 'GENERIC')),
    sector: text(body.sector),
    subsector: text(body.subsector),
    pais: text(body.pais, 'Colombia'),
    moneda: text(body.moneda, 'COP'),
    timezone: text(body.timezone, 'America/Bogota'),
    settings: jsonObject(body.settings || body.configuracion),
    modules_enabled: jsonArray(body.modules_enabled || body.modulos_activos),
    features_enabled: jsonArray(body.features_enabled || body.modulos_extra || body.funciones_especiales),
    estado: text(body.estado, 'ACTIVO')
  };

  const existing = await sql`SELECT id FROM empresas WHERE id = ${id} LIMIT 1`;
  if (existing.length) {
    await sql`
      UPDATE empresas SET
        nombre=${payload.nombre}, slug=${payload.slug}, nit=${payload.nit}, correo=${payload.correo},
        ciudad=${payload.ciudad}, plan=${payload.plan}, industry_type=${payload.industry_type},
        sector=${payload.sector}, subsector=${payload.subsector}, pais=${payload.pais},
        moneda=${payload.moneda}, timezone=${payload.timezone},
        settings=${JSON.stringify(payload.settings)}::jsonb,
        modules_enabled=${JSON.stringify(payload.modules_enabled)}::jsonb,
        features_enabled=${JSON.stringify(payload.features_enabled)}::jsonb,
        estado=${payload.estado},
        updated_at=NOW()
      WHERE id=${id}`;
    return { id, updated: true };
  }

  await sql`
    INSERT INTO empresas (
      id, nombre, slug, nit, correo, ciudad, plan, industry_type, sector, subsector,
      pais, moneda, timezone, settings, modules_enabled, features_enabled, estado,
      created_at, updated_at
    )
    VALUES (${payload.id}, ${payload.nombre}, ${payload.slug}, ${payload.nit}, ${payload.correo},
            ${payload.ciudad}, ${payload.plan}, ${payload.industry_type}, ${payload.sector},
            ${payload.subsector}, ${payload.pais}, ${payload.moneda}, ${payload.timezone},
            ${JSON.stringify(payload.settings)}::jsonb,
            ${JSON.stringify(payload.modules_enabled)}::jsonb,
            ${JSON.stringify(payload.features_enabled)}::jsonb,
            ${payload.estado}, NOW(), NOW())`;
  return { id, inserted: true };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  try {
    await ensureEmpresas(sql);

    if (req.method === 'GET') {
      if (req.query && req.query.config === '1') {
        const { id } = req.query;
        if (id) {
          if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'id uuid requerido' });
          const company = await sql`SELECT * FROM empresas WHERE id=${id} LIMIT 1`;
          if (!company.length) return res.status(404).json({ ok: false, error: 'empresa no encontrada' });
          return res.status(200).json({
            ok: true,
            company: company[0],
            config: resolveCompanyConfig(company[0]),
            industryTypes: INDUSTRY_CONFIGS,
            moduleRegistry: MODULE_REGISTRY,
            planModules: PLAN_MODULES,
          });
        }

        return res.status(200).json({
          ok: true,
          industryTypes: INDUSTRY_CONFIGS,
          moduleRegistry: MODULE_REGISTRY,
          planModules: PLAN_MODULES,
        });
      }

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
