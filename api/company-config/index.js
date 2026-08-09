const { getSQL, cors } = require('../_db');
const { INDUSTRY_CONFIGS, MODULE_REGISTRY, PLAN_MODULES, resolveCompanyConfig } = require('../config/industry');

async function ensureCompanyConfigColumns(sql) {
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS industry_type TEXT DEFAULT 'GENERIC'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS sector TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS subsector TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'Colombia'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'COP'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Bogota'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modules_enabled JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS features_enabled JSONB DEFAULT '[]'`;
  await sql`UPDATE empresas SET industry_type='GENERIC' WHERE industry_type IS NULL OR industry_type=''`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const sql = getSQL();
    await ensureCompanyConfigColumns(sql);
    const { company_id } = req.query;

    if (!company_id) {
      return res.status(200).json({
        ok: true,
        industryTypes: INDUSTRY_CONFIGS,
        moduleRegistry: MODULE_REGISTRY,
        planModules: PLAN_MODULES,
      });
    }

    const rows = await sql`SELECT * FROM empresas WHERE id = ${company_id} LIMIT 1`;
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    return res.status(200).json({
      ok: true,
      company: rows[0],
      config: resolveCompanyConfig(rows[0]),
      industryTypes: INDUSTRY_CONFIGS,
      moduleRegistry: MODULE_REGISTRY,
      planModules: PLAN_MODULES,
    });
  } catch (err) {
    console.error('[company-config]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
