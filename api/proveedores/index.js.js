// api/proveedores/index.js — CRUD + bulk replace for proveedores
const { getSQL, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  // Ensure table exists with all columns
  await sql`
    CREATE TABLE IF NOT EXISTS proveedores (
      id              TEXT PRIMARY KEY,
      codigo          TEXT,
      nit             TEXT,
      razon_social    TEXT NOT NULL,
      nombre_comercial TEXT,
      tipo_proveedor  TEXT,
      categoria       TEXT,
      marca           TEXT,
      contacto        TEXT,
      cargo           TEXT,
      telefono        TEXT,
      celular         TEXT,
      whatsapp        TEXT,
      correo          TEXT,
      correo_cartera  TEXT,
      sitio_web       TEXT,
      pais            TEXT DEFAULT 'Colombia',
      departamento    TEXT,
      ciudad          TEXT,
      direccion       TEXT,
      codigo_postal   TEXT,
      condicion_pago  TEXT,
      descuento       NUMERIC DEFAULT 0,
      tiempo_entrega  INTEGER DEFAULT 0,
      pedido_minimo   NUMERIC DEFAULT 0,
      banco           TEXT,
      tipo_cuenta     TEXT,
      numero_cuenta   TEXT,
      estado          TEXT DEFAULT 'Activo',
      origen_registro TEXT DEFAULT 'IMPORTADO',
      observaciones   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => {});

  // Add missing columns if upgrading
  for (const col of [
    `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS origen_registro TEXT DEFAULT 'IMPORTADO'`,
    `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS celular TEXT`,
    `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS correo_cartera TEXT`,
    `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tipo_proveedor TEXT`,
    `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cargo TEXT`,
    `ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS id TEXT`,
  ]) {
    await sql.unsafe(col).catch(() => {});
  }

  // ── GET — list all ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM proveedores ORDER BY razon_social`;
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, origen } = req.query;
    try {
      if (origen === 'IMPORTADO') {
        // Delete ALL importados (used by bulk replace)
        await sql`DELETE FROM proveedores WHERE origen_registro = 'IMPORTADO'`;
        return res.json({ ok: true, action: 'deleted_all_importados' });
      }
      if (id) {
        await sql`DELETE FROM proveedores WHERE id = ${id}`;
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: 'id o origen requerido' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST — upsert single or bulk ────────────────────────────────────────
  if (req.method === 'POST') {
    const b = req.body || {};

    // BULK REPLACE: { action: 'bulk_replace', proveedores: [...] }
    if (b.action === 'bulk_replace') {
      const rows = b.proveedores || [];
      try {
        // Step 1: Delete all importados
        await sql`DELETE FROM proveedores WHERE origen_registro = 'IMPORTADO'`;

        // Step 2: Insert all new importados
        let inserted = 0;
        for (const p of rows) {
          if (!p.razon_social) continue;
          await sql`
            INSERT INTO proveedores (
              id, codigo, nit, razon_social, nombre_comercial, tipo_proveedor,
              categoria, marca, contacto, cargo, telefono, celular, whatsapp,
              correo, correo_cartera, sitio_web, pais, departamento, ciudad,
              direccion, codigo_postal, condicion_pago, descuento, tiempo_entrega,
              pedido_minimo, banco, tipo_cuenta, numero_cuenta, estado,
              origen_registro, observaciones, updated_at
            ) VALUES (
              ${p.id||null}, ${p.codigo||null}, ${p.nit||null}, ${p.razon_social},
              ${p.nombre_comercial||null}, ${p.tipo_proveedor||null},
              ${p.categoria||null}, ${p.marca||null}, ${p.contacto||null},
              ${p.cargo||null}, ${p.telefono||null}, ${p.celular||null},
              ${p.whatsapp||null}, ${p.correo||null}, ${p.correo_cartera||null},
              ${p.sitio_web||null}, ${p.pais||'Colombia'}, ${p.departamento||null},
              ${p.ciudad||null}, ${p.direccion||null}, ${p.codigo_postal||null},
              ${p.condicion_pago||null}, ${p.descuento||0}, ${p.tiempo_entrega||0},
              ${p.pedido_minimo||0}, ${p.banco||null}, ${p.tipo_cuenta||null},
              ${p.numero_cuenta||null}, ${p.estado||'Activo'}, 'IMPORTADO',
              ${p.observaciones||null}, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              nit = EXCLUDED.nit,
              razon_social = EXCLUDED.razon_social,
              nombre_comercial = EXCLUDED.nombre_comercial,
              tipo_proveedor = EXCLUDED.tipo_proveedor,
              contacto = EXCLUDED.contacto,
              telefono = EXCLUDED.telefono,
              celular = EXCLUDED.celular,
              correo = EXCLUDED.correo,
              ciudad = EXCLUDED.ciudad,
              estado = EXCLUDED.estado,
              origen_registro = 'IMPORTADO',
              updated_at = NOW()
          `.catch(() => {});
          inserted++;
        }
        return res.json({ ok: true, inserted });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // SINGLE upsert
    if (!b.razon_social) return res.status(400).json({ error: 'Razón Social requerida' });
    try {
      await sql`
        INSERT INTO proveedores (
          id, codigo, nit, razon_social, nombre_comercial, tipo_proveedor,
          categoria, marca, contacto, cargo, telefono, celular, whatsapp,
          correo, correo_cartera, sitio_web, pais, departamento, ciudad,
          direccion, codigo_postal, condicion_pago, descuento, tiempo_entrega,
          pedido_minimo, banco, tipo_cuenta, numero_cuenta, estado,
          origen_registro, observaciones, updated_at
        ) VALUES (
          ${b.id||null}, ${b.codigo||null}, ${b.nit||null}, ${b.razon_social},
          ${b.nombre_comercial||null}, ${b.tipo_proveedor||null},
          ${b.categoria||null}, ${b.marca||null}, ${b.contacto||null},
          ${b.cargo||null}, ${b.telefono||null}, ${b.celular||null},
          ${b.whatsapp||null}, ${b.correo||null}, ${b.correo_cartera||null},
          ${b.sitio_web||null}, ${b.pais||'Colombia'}, ${b.departamento||null},
          ${b.ciudad||null}, ${b.direccion||null}, ${b.codigo_postal||null},
          ${b.condicion_pago||null}, ${b.descuento||0}, ${b.tiempo_entrega||0},
          ${b.pedido_minimo||0}, ${b.banco||null}, ${b.tipo_cuenta||null},
          ${b.numero_cuenta||null}, ${b.estado||'Activo'},
          ${b.origen_registro||'IMPORTADO'}, ${b.observaciones||null}, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          nit = EXCLUDED.nit,
          razon_social = EXCLUDED.razon_social,
          nombre_comercial = EXCLUDED.nombre_comercial,
          contacto = EXCLUDED.contacto, telefono = EXCLUDED.telefono,
          correo = EXCLUDED.correo, ciudad = EXCLUDED.ciudad,
          estado = EXCLUDED.estado, origen_registro = EXCLUDED.origen_registro,
          updated_at = NOW()
      `;
      return res.status(201).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
