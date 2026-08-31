// api/ubicaciones/index.js
const { getSQL, cors } = require('../_db');
const { normalizeMotoPartsLocation, validateMotoPartsLocation } = require('../../lib/motoparts-locations');

async function ensureMotoPartsLocationStorage(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS motoparts_locations (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      codigo TEXT NOT NULL,
      nombre TEXT,
      tipo TEXT NOT NULL,
      grupo TEXT NOT NULL,
      descripcion TEXT,
      bodega_id TEXT,
      empresa_id TEXT,
      estado TEXT DEFAULT 'ACTIVA',
      permite_multiples_referencias BOOLEAN DEFAULT TRUE,
      permite_vin BOOLEAN DEFAULT FALSE,
      capacidad NUMERIC(12,2),
      recorrido_orden INTEGER,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS motoparts_locations_empresa_codigo_uidx ON motoparts_locations ((COALESCE(empresa_id, '__GLOBAL__')), codigo)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_locations_empresa_idx ON motoparts_locations (empresa_id)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_locations_tipo_idx ON motoparts_locations (tipo)`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS codigo TEXT`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activa'`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS empresa_id TEXT`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS direccion TEXT`.catch(()=>{});
  await sql`ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS responsable TEXT`.catch(()=>{});

  const isMotoParts = (req.query && req.query.mode === 'motoparts') || (req.body && req.body.mode === 'motoparts');
  if (isMotoParts) await ensureMotoPartsLocationStorage(sql);

  if (req.method === 'GET') {
    const { empresa_id, tipo, codigo } = req.query;
    if (isMotoParts) {
      const normalizedCode = codigo ? validateMotoPartsLocation(codigo) : null;
      if (codigo && !normalizedCode.ok) return res.status(400).json({ ok: false, error: normalizedCode.message });
      let rows;
      if (empresa_id && tipo && codigo) {
        rows = await sql`SELECT * FROM motoparts_locations WHERE empresa_id = ${empresa_id} AND tipo = ${String(tipo).toUpperCase()} AND codigo = ${normalizedCode.code} ORDER BY recorrido_orden NULLS LAST, codigo`;
      } else if (empresa_id && tipo) {
        rows = await sql`SELECT * FROM motoparts_locations WHERE empresa_id = ${empresa_id} AND tipo = ${String(tipo).toUpperCase()} ORDER BY recorrido_orden NULLS LAST, codigo`;
      } else if (empresa_id && codigo) {
        rows = await sql`SELECT * FROM motoparts_locations WHERE empresa_id = ${empresa_id} AND codigo = ${normalizedCode.code} ORDER BY recorrido_orden NULLS LAST, codigo`;
      } else if (empresa_id) {
        rows = await sql`SELECT * FROM motoparts_locations WHERE empresa_id = ${empresa_id} ORDER BY recorrido_orden NULLS LAST, codigo`;
      } else if (tipo) {
        rows = await sql`SELECT * FROM motoparts_locations WHERE tipo = ${String(tipo).toUpperCase()} ORDER BY recorrido_orden NULLS LAST, codigo`;
      } else if (codigo) {
        rows = await sql`SELECT * FROM motoparts_locations WHERE codigo = ${normalizedCode.code} ORDER BY recorrido_orden NULLS LAST, codigo`;
      } else {
        rows = await sql`SELECT * FROM motoparts_locations ORDER BY recorrido_orden NULLS LAST, codigo`;
      }
      return res.json({ ok: true, data: rows, total: rows.length });
    }
    const rows = empresa_id && empresa_id !== '__SA__'
      ? await sql`SELECT * FROM ubicaciones WHERE empresa_id = ${empresa_id} OR empresa_id IS NULL ORDER BY nombre`
      : await sql`SELECT * FROM ubicaciones ORDER BY nombre`;
    return res.json({ ok: true, data: rows, total: rows.length });
  }
  if (req.method === 'POST') {
    if (isMotoParts) {
      const payload = normalizeMotoPartsLocation(req.body || {});
      if (!payload.ok) return res.status(400).json({ ok: false, error: payload.message });
      const rows = await sql`
        INSERT INTO motoparts_locations (
          id, codigo, nombre, tipo, grupo, descripcion, bodega_id, empresa_id, estado,
          permite_multiples_referencias, permite_vin, capacidad, recorrido_orden, metadata, updated_at
        )
        VALUES (
          ${payload.id}, ${payload.codigo}, ${payload.nombre}, ${payload.tipo}, ${payload.grupo},
          ${payload.descripcion}, ${payload.bodega_id}, ${payload.empresa_id}, ${payload.estado},
          ${payload.permite_multiples_referencias}, ${payload.permite_vin}, ${payload.capacidad},
          ${payload.recorrido_orden}, ${JSON.stringify(payload.metadata)}::jsonb, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          codigo=EXCLUDED.codigo,
          nombre=EXCLUDED.nombre,
          tipo=EXCLUDED.tipo,
          grupo=EXCLUDED.grupo,
          descripcion=EXCLUDED.descripcion,
          bodega_id=EXCLUDED.bodega_id,
          empresa_id=EXCLUDED.empresa_id,
          estado=EXCLUDED.estado,
          permite_multiples_referencias=EXCLUDED.permite_multiples_referencias,
          permite_vin=EXCLUDED.permite_vin,
          capacidad=EXCLUDED.capacidad,
          recorrido_orden=EXCLUDED.recorrido_orden,
          metadata=EXCLUDED.metadata,
          updated_at=NOW()
        RETURNING *`;
      return res.status(201).json({ ok: true, data: rows[0], id: rows[0].id });
    }
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
  if (req.method === 'DELETE' && isMotoParts) {
    const { empresa_id, codigo } = req.query || {};
    const validation = validateMotoPartsLocation(codigo);
    if (!empresa_id || !validation.ok) return res.status(400).json({ ok: false, error: 'empresa_id y codigo valido son requeridos' });
    const rows = await sql`
      UPDATE motoparts_locations
      SET estado = 'INACTIVA', updated_at = NOW()
      WHERE empresa_id = ${empresa_id} AND codigo = ${validation.code}
      RETURNING *`;
    return res.json({ ok: true, data: rows[0] || null });
  }
  res.status(405).end();
};
