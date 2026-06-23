// api/articulos/index.js — StockFlow WMS
// Maneja GET, POST (batch), PUT (update), DELETE, acción deactivate
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Todos los campos del modelo de artículo
const CAMPOS = [
  'id','sku','nombre','descripcion','categoria','subcategoria',
  'marca','unidad','ubicacion','ubicacion_label','bodega','bodega_id',
  'stock','stock_minimo','stock_maximo','stock_reservado','stock_seguridad',
  'punto_reorden','consumo_diario','lead_time','dias_cobertura','metodo_seguridad',
  'costo','precio','proveedor','estado',
  'empresa_id','created_by','ultima_entrada','ultima_salida',
];

function pick(obj, fields) {
  const out = {};
  fields.forEach(f => { if (f in obj) out[f] = obj[f]; });
  return out;
}

function n(v) {
  if (v === null || v === undefined || v === '') return null;
  const num = parseFloat(String(v).replace(/[^0-9.\-]/g,''));
  return isNaN(num) ? null : num;
}

function s(v) {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS articulos (
      id               TEXT PRIMARY KEY,
      sku              TEXT UNIQUE NOT NULL,
      nombre           TEXT,
      descripcion      TEXT,
      categoria        TEXT,
      subcategoria     VARCHAR(200) DEFAULT '',
      marca            TEXT,
      unidad           TEXT DEFAULT 'UND',
      ubicacion        TEXT,
      ubicacion_label  TEXT,
      bodega           VARCHAR(200) DEFAULT '',
      bodega_id        TEXT,
      stock            NUMERIC(14,2) DEFAULT 0,
      stock_minimo     NUMERIC(14,2) DEFAULT 0,
      stock_maximo     NUMERIC(14,2) DEFAULT 0,
      stock_reservado  NUMERIC(14,2) DEFAULT 0,
      stock_seguridad  NUMERIC(14,2) DEFAULT 0,
      punto_reorden    NUMERIC(14,2) DEFAULT 0,
      consumo_diario   NUMERIC(14,4) DEFAULT 0,
      lead_time        NUMERIC(8,0)  DEFAULT 0,
      dias_cobertura   NUMERIC(8,0)  DEFAULT 0,
      metodo_seguridad VARCHAR(20)   DEFAULT 'automatico',
      costo            NUMERIC(14,2) DEFAULT 0,
      precio           NUMERIC(14,2) DEFAULT 0,
      proveedor        TEXT,
      estado           TEXT DEFAULT 'Activo',
      empresa_id       VARCHAR(100),
      created_by       TEXT,
      ultima_entrada   TEXT,
      ultima_salida    TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTable();
    const { action, limit = 5000, empresa_id } = req.query;

    // ── GET — listar artículos ─────────────────────────────────────────
    if (req.method === 'GET') {
      if (action === 'deactivate') return res.status(400).json({ error: 'Use POST for deactivate' });

      let rows;
      if (empresa_id) {
        rows = await sql`
          SELECT * FROM articulos 
          WHERE empresa_id = ${empresa_id}
          ORDER BY sku 
          LIMIT ${parseInt(limit)}
        `;
      } else {
        rows = await sql`
          SELECT * FROM articulos 
          ORDER BY sku 
          LIMIT ${parseInt(limit)}
        `;
      }
      return res.status(200).json({ data: rows, total: rows.length });
    }

    // ── POST — batch upsert o deactivate ──────────────────────────────
    if (req.method === 'POST') {
      const body = req.body;

      // Deactivate action
      if (action === 'deactivate') {
        const { skus, usuario } = body;
        if (!skus?.length) return res.status(200).json({ deactivated: 0 });
        await sql`
          UPDATE articulos 
          SET estado = 'Inactivo', updated_at = NOW()
          WHERE sku = ANY(${skus})
        `;
        return res.status(200).json({ deactivated: skus.length });
      }

      // Batch upsert
      const { items } = body;
      if (!items?.length) return res.status(400).json({ error: 'No items provided' });

      let inserted = 0, updated = 0, errors = [];

      for (const item of items) {
        try {
          const id            = s(item.id)     || `art_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
          const sku           = s(item.sku)    || s(item.codigo);
          if (!sku) { errors.push({ sku: '?', error: 'SKU vacío' }); continue; }

          const nombre        = s(item.nombre)        || s(item.descripcion) || '';
          const descripcion   = s(item.descripcion)   || '';
          const categoria     = s(item.categoria)     || '';
          const subcategoria  = s(item.subcategoria)  || '';
          const marca         = s(item.marca)         || '';
          const unidad        = s(item.unidad)        || 'UND';
          const ubicacion     = s(item.ubicacion)     || '';
          const ubicacion_lbl = s(item.ubicacion_label)|| s(item.ubicacion) || '';
          const bodega        = s(item.bodega)        || '';
          const bodega_id     = s(item.bodega_id)     || s(item.bodega) || '';
          const proveedor     = s(item.proveedor)     || '';
          const estado        = s(item.estado)        || 'Activo';
          const empresa_id_v  = s(item.empresa_id)    || null;
          const created_by    = s(item.created_by)    || 'Sistema';
          const ultima_ent    = s(item.ultima_entrada) || null;
          const ultima_sal    = s(item.ultima_salida)  || null;
          const metodo_seg    = s(item.metodo_seguridad) || 'automatico';

          // Numéricos — todos con fallback a 0
          const stock         = n(item.stock)          ?? 0;
          const stock_min     = n(item.stock_minimo)   ?? 0;
          const stock_max     = n(item.stock_maximo)   ?? 0;
          const stock_res     = n(item.stock_reservado)?? 0;
          const stock_seg     = n(item.stock_seguridad)?? 0;
          const p_reorden     = n(item.punto_reorden)  ?? 0;
          const consumo       = n(item.consumo_diario) ?? 0;
          const lead          = n(item.lead_time)      ?? 0;
          const dias_cob      = n(item.dias_cobertura) ?? 0;
          const costo         = n(item.costo)          ?? n(item.costo_unitario) ?? 0;
          const precio        = n(item.precio)         ?? costo ?? 0;

          await sql`
            INSERT INTO articulos (
              id, sku, nombre, descripcion, categoria, subcategoria,
              marca, unidad, ubicacion, ubicacion_label, bodega, bodega_id,
              stock, stock_minimo, stock_maximo, stock_reservado, stock_seguridad,
              punto_reorden, consumo_diario, lead_time, dias_cobertura, metodo_seguridad,
              costo, precio, proveedor, estado, empresa_id,
              created_by, ultima_entrada, ultima_salida,
              created_at, updated_at
            ) VALUES (
              ${id}, ${sku}, ${nombre}, ${descripcion}, ${categoria}, ${subcategoria},
              ${marca}, ${unidad}, ${ubicacion}, ${ubicacion_lbl}, ${bodega}, ${bodega_id},
              ${stock}, ${stock_min}, ${stock_max}, ${stock_res}, ${stock_seg},
              ${p_reorden}, ${consumo}, ${lead}, ${dias_cob}, ${metodo_seg},
              ${costo}, ${precio}, ${proveedor}, ${estado}, ${empresa_id_v},
              ${created_by}, ${ultima_ent}, ${ultima_sal},
              NOW(), NOW()
            )
            ON CONFLICT (sku) DO UPDATE SET
              nombre           = EXCLUDED.nombre,
              descripcion      = EXCLUDED.descripcion,
              categoria        = EXCLUDED.categoria,
              subcategoria     = EXCLUDED.subcategoria,
              marca            = EXCLUDED.marca,
              unidad           = EXCLUDED.unidad,
              ubicacion        = EXCLUDED.ubicacion,
              ubicacion_label  = EXCLUDED.ubicacion_label,
              bodega           = EXCLUDED.bodega,
              bodega_id        = EXCLUDED.bodega_id,
              stock            = EXCLUDED.stock,
              stock_minimo     = EXCLUDED.stock_minimo,
              stock_maximo     = EXCLUDED.stock_maximo,
              stock_reservado  = EXCLUDED.stock_reservado,
              stock_seguridad  = EXCLUDED.stock_seguridad,
              punto_reorden    = EXCLUDED.punto_reorden,
              consumo_diario   = EXCLUDED.consumo_diario,
              lead_time        = EXCLUDED.lead_time,
              dias_cobertura   = EXCLUDED.dias_cobertura,
              metodo_seguridad = EXCLUDED.metodo_seguridad,
              costo            = EXCLUDED.costo,
              precio           = EXCLUDED.precio,
              proveedor        = EXCLUDED.proveedor,
              estado           = EXCLUDED.estado,
              empresa_id       = COALESCE(EXCLUDED.empresa_id, articulos.empresa_id),
              created_by       = EXCLUDED.created_by,
              ultima_entrada   = COALESCE(EXCLUDED.ultima_entrada, articulos.ultima_entrada),
              ultima_salida    = COALESCE(EXCLUDED.ultima_salida, articulos.ultima_salida),
              updated_at       = NOW()
          `;

          // Check if it was insert or update
          const exists = await sql`SELECT id FROM articulos WHERE sku = ${sku}`;
          if (exists.length > 0 && exists[0].id !== id) updated++; else inserted++;

        } catch(e) {
          errors.push({ sku: item.sku || '?', error: e.message });
        }
      }

      return res.status(200).json({ inserted, updated, errors });
    }

    // ── PUT — update single item ──────────────────────────────────────
    if (req.method === 'PUT') {
      const item = req.body;
      const sku  = s(item.sku) || s(item.codigo);
      if (!sku) return res.status(400).json({ error: 'SKU requerido' });

      await sql`
        UPDATE articulos SET
          nombre           = COALESCE(${s(item.nombre)}, nombre),
          descripcion      = COALESCE(${s(item.descripcion)}, descripcion),
          categoria        = COALESCE(${s(item.categoria)}, categoria),
          subcategoria     = COALESCE(${s(item.subcategoria)}, subcategoria),
          marca            = COALESCE(${s(item.marca)}, marca),
          unidad           = COALESCE(${s(item.unidad)}, unidad),
          ubicacion        = COALESCE(${s(item.ubicacion)}, ubicacion),
          bodega           = COALESCE(${s(item.bodega)}, bodega),
          stock            = COALESCE(${n(item.stock)}, stock),
          stock_minimo     = COALESCE(${n(item.stock_minimo)}, stock_minimo),
          stock_maximo     = COALESCE(${n(item.stock_maximo)}, stock_maximo),
          stock_reservado  = COALESCE(${n(item.stock_reservado)}, stock_reservado),
          stock_seguridad  = COALESCE(${n(item.stock_seguridad)}, stock_seguridad),
          punto_reorden    = COALESCE(${n(item.punto_reorden)}, punto_reorden),
          consumo_diario   = COALESCE(${n(item.consumo_diario)}, consumo_diario),
          lead_time        = COALESCE(${n(item.lead_time)}, lead_time),
          costo            = COALESCE(${n(item.costo)}, costo),
          precio           = COALESCE(${n(item.precio)}, precio),
          proveedor        = COALESCE(${s(item.proveedor)}, proveedor),
          estado           = COALESCE(${s(item.estado)}, estado),
          empresa_id       = COALESCE(${s(item.empresa_id)}, empresa_id),
          ultima_entrada   = COALESCE(${s(item.ultima_entrada)}, ultima_entrada),
          updated_at       = NOW()
        WHERE sku = ${sku}
      `;
      return res.status(200).json({ updated: 1 });
    }

    // ── DELETE ────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { sku } = req.query;
      if (!sku) return res.status(400).json({ error: 'SKU requerido' });
      await sql`DELETE FROM articulos WHERE sku = ${sku}`;
      return res.status(200).json({ deleted: 1 });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err) {
    console.error('API articulos error:', err);
    return res.status(500).json({ error: err.message });
  }
}
