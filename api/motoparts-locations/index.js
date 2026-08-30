const { getSQL, setupTables, cors } = require('../_db');
const { normalizeMotoPartsLocation, validateMotoPartsLocation } = require('../../lib/motoparts-locations');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  await setupTables(sql);

  if (req.method === 'GET') {
    const { empresa_id, tipo, codigo } = req.query || {};
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

  if (req.method === 'POST') {
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

  if (req.method === 'DELETE') {
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

  return res.status(405).end();
};
