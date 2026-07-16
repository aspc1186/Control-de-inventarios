// api/proveedores/index.js — StockFlow WMS
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  const empresa_id = req.query.empresa_id || null;

  try {
    if (req.method === 'GET') {
      let rows;
      if (empresa_id && empresa_id !== '__SA__') {
        rows = await sql`
          SELECT * FROM proveedores 
          WHERE empresa_id = ${empresa_id}
          ORDER BY nombre ASC`;
      } else {
        rows = await sql`SELECT * FROM proveedores ORDER BY nombre ASC`;
      }
      return res.status(200).json({ ok: true, data: rows });
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (Array.isArray(body)) {
        // Bulk upsert
        if (body.length === 0) return res.status(200).json({ ok: true, count: 0 });
        
        // Delete existing for this empresa and re-insert
        if (empresa_id) {
          await sql`DELETE FROM proveedores WHERE empresa_id = ${empresa_id}`;
        }
        
        let count = 0;
        for (const p of body) {
          await sql`
            INSERT INTO proveedores (
              id, nombre, nit, contacto, telefono, correo, 
              direccion, ciudad, pais, estado, empresa_id,
              notas, categoria, lead_time_dias, created_at
            ) VALUES (
              ${p.id || ('pv_' + Date.now() + '_' + Math.random().toString(36).substr(2,4))},
              ${p.nombre || null}, ${p.nit || null}, ${p.contacto || null},
              ${p.telefono || null}, ${p.correo || null}, ${p.direccion || null},
              ${p.ciudad || null}, ${p.pais || 'Colombia'}, ${p.estado || 'ACTIVO'},
              ${p.empresa_id || empresa_id || null}, ${p.notas || null},
              ${p.categoria || null}, ${p.lead_time_dias || null},
              ${p.created_at || new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              nombre = EXCLUDED.nombre,
              nit = EXCLUDED.nit,
              contacto = EXCLUDED.contacto,
              telefono = EXCLUDED.telefono,
              correo = EXCLUDED.correo,
              estado = EXCLUDED.estado,
              notas = EXCLUDED.notas
          `;
          count++;
        }
        return res.status(200).json({ ok: true, count });
      } else {
        // Single insert
        const p = body;
        const id = p.id || ('pv_' + Date.now());
        await sql`
          INSERT INTO proveedores (id, nombre, nit, contacto, telefono, correo, estado, empresa_id)
          VALUES (${id}, ${p.nombre||null}, ${p.nit||null}, ${p.contacto||null}, 
                  ${p.telefono||null}, ${p.correo||null}, ${p.estado||'ACTIVO'}, ${p.empresa_id||empresa_id||null})
          ON CONFLICT (id) DO UPDATE SET
            nombre=EXCLUDED.nombre, estado=EXCLUDED.estado
        `;
        return res.status(200).json({ ok: true, id });
      }
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
      await sql`
        UPDATE proveedores SET
          nombre = ${updates.nombre || null},
          contacto = ${updates.contacto || null},
          telefono = ${updates.telefono || null},
          correo = ${updates.correo || null},
          estado = ${updates.estado || 'ACTIVO'},
          notas = ${updates.notas || null}
        WHERE id = ${id}
      `;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
      await sql`UPDATE proveedores SET estado = 'INACTIVO' WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (err) {
    console.error('API proveedores error:', err);
    // Si la tabla no existe, crearla
    if (err.message && err.message.includes('does not exist')) {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS proveedores (
            id TEXT PRIMARY KEY,
            nombre TEXT, nit TEXT, contacto TEXT, telefono TEXT,
            correo TEXT, direccion TEXT, ciudad TEXT, pais TEXT DEFAULT 'Colombia',
            estado TEXT DEFAULT 'ACTIVO', empresa_id TEXT,
            notas TEXT, categoria TEXT, lead_time_dias INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `;
        return res.status(200).json({ ok: true, data: [], created_table: true });
      } catch (e2) {
        return res.status(500).json({ ok: false, error: e2.message });
      }
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
};
