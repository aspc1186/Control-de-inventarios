// api/ubicaciones/index.js
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS codigo TEXT`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activa'`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS empresa_id TEXT`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS direccion TEXT`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS responsable TEXT`.catch(()=>{});

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM ubicaciones ORDER BY nombre`;
    return res.json({ ok: true, data: rows, total: rows.length });
  }
  if (req.method === 'POST') {
    const { id, codigo, nombre, descripcion, pasillos, ubicaciones, estado, empresa_id, direccion, responsable } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const rowId = String(id || codigo || nombre).trim();
    const code = String(codigo || rowId).trim().toUpperCase();
    const payload = Array.isArray(pasillos) && pasillos.length ? pasillos : (Array.isArray(ubicaciones) ? ubicaciones : []);
    const rows = await sql`
      INSERT INTO ubicaciones (id, codigo, nombre, descripcion, pasillos, estado, empresa_id, direccion, responsable)
      VALUES (${rowId}, ${code}, ${nombre}, ${descripcion||null}, ${JSON.stringify(payload)}::jsonb,
              ${estado||'Activa'}, ${empresa_id||null}, ${direccion||null}, ${responsable||null})
      ON CONFLICT (id) DO UPDATE SET
        codigo=EXCLUDED.codigo, nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion,
        pasillos=EXCLUDED.pasillos, estado=EXCLUDED.estado, empresa_id=EXCLUDED.empresa_id,
        direccion=EXCLUDED.direccion, responsable=EXCLUDED.responsable
      RETURNING *`;
    return res.status(201).json({ ok: true, data: rows[0], id: rows[0].id });
  }
  res.status(405).end();
};
