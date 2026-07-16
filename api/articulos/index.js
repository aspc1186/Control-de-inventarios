// api/articulos/index.js — StockFlow WMS v2
// Maneja GET, POST (batch upsert), PUT (update single), DELETE, deactivate
const { getSQL, cors } = require('../_db');


// Todos los campos del modelo — sincronizados con COL mapping del frontend
const CAMPOS_TEXTO = [
  'sku','nombre','descripcion','categoria','subcategoria','marca',
  'unidad','ubicacion','ubicacion_label','bodega','bodega_id',
  'proveedor','estado','empresa_id','created_by',
  'ultima_entrada','ultima_salida','codigo_barras','metodo_seguridad',
];
const CAMPOS_NUMERO = [
  'stock','stock_minimo','stock_maximo','stock_reservado','stock_seguridad',
  'punto_reorden','consumo_diario','lead_time','dias_cobertura',
  'costo','precio',
];

function n(v) {
  if (v === null || v === undefined || v === '') return null;
  const num = parseFloat(String(v).replace(/[^0-9.\-]/g,''));
  return isNaN(num) ? null : num;
}
function s(v) {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str === '' ? null : str;
}

async function ensureColumns(sql) {
  // Add any missing columns (idempotent)
  const alterStatements = [
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS stock_seguridad  NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS consumo_diario   NUMERIC(14,4) DEFAULT 0`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS lead_time        NUMERIC(8,0)  DEFAULT 0`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS dias_cobertura   NUMERIC(8,0)  DEFAULT 0`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS metodo_seguridad VARCHAR(20)   DEFAULT 'automatico'`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS subcategoria     VARCHAR(200)  DEFAULT ''`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS bodega           VARCHAR(200)  DEFAULT ''`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS precio           NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS codigo_barras    VARCHAR(100)  DEFAULT ''`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS empresa_id       VARCHAR(100)`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ultima_entrada   TEXT`,
    `ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ultima_salida    TEXT`,
  ];
  for (const stmt of alterStatements) {
    try { await sql.unsafe(stmt); } catch(e) { /* column exists */ }
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  try {
    // Ensure columns exist on every request (cheap — uses IF NOT EXISTS)
    await ensureColumns(sql);

    const { action, limit = 5000, empresa_id } = req.query;

    // ── GET ───────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      let rows;
      if (empresa_id) {
        rows = await sql`
          SELECT * FROM articulos 
          WHERE empresa_id = ${empresa_id} AND estado != 'Inactivo'
          ORDER BY sku LIMIT ${parseInt(limit)}`;
      } else {
        rows = await sql`
          SELECT * FROM articulos 
          ORDER BY sku LIMIT ${parseInt(limit)}`;
      }
      return res.status(200).json({ data: rows, total: rows.length });
    }

    // ── POST ──────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      // Deactivate action
      if (action === 'deactivate') {
        const { skus } = req.body;
        if (!skus?.length) return res.status(200).json({ deactivated: 0 });
        await sql`UPDATE articulos SET estado='Inactivo', updated_at=NOW() WHERE sku=ANY(${skus})`;
        return res.status(200).json({ deactivated: skus.length });
      }

      // Batch upsert
      const { items } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'No items' });

      let inserted = 0, updated = 0, errors = [];

      for (const item of items) {
        try {
          const sku = s(item.sku || item.codigo);
          if (!sku) { errors.push({ sku: '?', error: 'SKU vacío' }); continue; }

          const id               = s(item.id) || `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
          const nombre           = s(item.nombre)          || '';
          const descripcion      = s(item.descripcion)     || '';
          const categoria        = s(item.categoria)       || '';
          const subcategoria     = s(item.subcategoria)    || '';
          const marca            = s(item.marca)           || '';
          const unidad           = s(item.unidad)          || 'UND';
          const ubicacion        = s(item.ubicacion)       || '';
          const ubicacion_label  = s(item.ubicacion_label) || ubicacion;
          const bodega           = s(item.bodega)          || '';
          const bodega_id        = s(item.bodega_id)       || bodega;
          const proveedor        = s(item.proveedor)       || '';
          const estado           = s(item.estado)          || 'Activo';
          const empresa_id_v     = s(item.empresa_id)      || null;
          const created_by       = s(item.created_by)      || 'Sistema';
          const ultima_ent       = s(item.ultima_entrada)  || null;
          const ultima_sal       = s(item.ultima_salida)   || null;
          const metodo_seg       = s(item.metodo_seguridad)|| 'automatico';
          const codigo_barras    = s(item.codigo_barras)   || '';

          const stock            = n(item.stock)           ?? 0;
          const stock_min        = n(item.stock_minimo)    ?? 0;
          const stock_max        = n(item.stock_maximo)    ?? 0;
          const stock_res        = n(item.stock_reservado) ?? 0;
          const stock_seg        = n(item.stock_seguridad) ?? 0;
          const p_reorden        = n(item.punto_reorden)   ?? 0;
          const consumo          = n(item.consumo_diario)  ?? 0;
          const lead             = n(item.lead_time)       ?? 0;
          const dias_cob         = n(item.dias_cobertura)  ?? 0;
          const costo            = n(item.costo)           ?? n(item.costo_unitario) ?? 0;
          const precio           = n(item.precio)          ?? costo;

          // Check if exists
          const existing = await sql`SELECT id FROM articulos WHERE sku=${sku} LIMIT 1`;

          if (existing.length > 0) {
            await sql`
              UPDATE articulos SET
                nombre=${nombre}, descripcion=${descripcion},
                categoria=${categoria}, subcategoria=${subcategoria},
                marca=${marca}, unidad=${unidad},
                ubicacion=${ubicacion}, ubicacion_label=${ubicacion_label},
                bodega=${bodega}, bodega_id=${bodega_id},
                stock=${stock}, stock_minimo=${stock_min}, stock_maximo=${stock_max},
                stock_reservado=${stock_res}, stock_seguridad=${stock_seg},
                punto_reorden=${p_reorden}, consumo_diario=${consumo},
                lead_time=${lead}, dias_cobertura=${dias_cob},
                metodo_seguridad=${metodo_seg},
                costo=${costo}, precio=${precio},
                proveedor=${proveedor}, estado=${estado},
                empresa_id=COALESCE(${empresa_id_v}, empresa_id),
                ultima_entrada=COALESCE(${ultima_ent}, ultima_entrada),
                ultima_salida=COALESCE(${ultima_sal}, ultima_salida),
                codigo_barras=${codigo_barras},
                created_by=${created_by}, updated_at=NOW()
              WHERE sku=${sku}`;
            updated++;
          } else {
            await sql`
              INSERT INTO articulos (
                id, sku, nombre, descripcion, categoria, subcategoria,
                marca, unidad, ubicacion, ubicacion_label, bodega, bodega_id,
                stock, stock_minimo, stock_maximo, stock_reservado, stock_seguridad,
                punto_reorden, consumo_diario, lead_time, dias_cobertura, metodo_seguridad,
                costo, precio, proveedor, estado, empresa_id, created_by,
                ultima_entrada, ultima_salida, codigo_barras, created_at, updated_at
              ) VALUES (
                ${id}, ${sku}, ${nombre}, ${descripcion}, ${categoria}, ${subcategoria},
                ${marca}, ${unidad}, ${ubicacion}, ${ubicacion_label}, ${bodega}, ${bodega_id},
                ${stock}, ${stock_min}, ${stock_max}, ${stock_res}, ${stock_seg},
                ${p_reorden}, ${consumo}, ${lead}, ${dias_cob}, ${metodo_seg},
                ${costo}, ${precio}, ${proveedor}, ${estado}, ${empresa_id_v}, ${created_by},
                ${ultima_ent}, ${ultima_sal}, ${codigo_barras}, NOW(), NOW()
              )`;
            inserted++;
          }
        } catch(e) {
          errors.push({ sku: item.sku || '?', error: e.message.slice(0,100) });
        }
      }
      return res.status(200).json({ inserted, updated, errors });
    }

    // ── PUT ───────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const item = req.body;
      const sku  = s(item.sku || item.codigo);
      if (!sku) return res.status(400).json({ error: 'SKU requerido' });
      await sql`
        UPDATE articulos SET
          nombre=COALESCE(${s(item.nombre)},nombre),
          descripcion=COALESCE(${s(item.descripcion)},descripcion),
          categoria=COALESCE(${s(item.categoria)},categoria),
          marca=COALESCE(${s(item.marca)},marca),
          unidad=COALESCE(${s(item.unidad)},unidad),
          ubicacion=COALESCE(${s(item.ubicacion)},ubicacion),
          bodega=COALESCE(${s(item.bodega)},bodega),
          stock=COALESCE(${n(item.stock)},stock),
          stock_minimo=COALESCE(${n(item.stock_minimo)},stock_minimo),
          stock_maximo=COALESCE(${n(item.stock_maximo)},stock_maximo),
          stock_seguridad=COALESCE(${n(item.stock_seguridad)},stock_seguridad),
          punto_reorden=COALESCE(${n(item.punto_reorden)},punto_reorden),
          consumo_diario=COALESCE(${n(item.consumo_diario)},consumo_diario),
          lead_time=COALESCE(${n(item.lead_time)},lead_time),
          costo=COALESCE(${n(item.costo)},costo),
          precio=COALESCE(${n(item.precio)},precio),
          proveedor=COALESCE(${s(item.proveedor)},proveedor),
          estado=COALESCE(${s(item.estado)},estado),
          empresa_id=COALESCE(${s(item.empresa_id)},empresa_id),
          ultima_entrada=COALESCE(${s(item.ultima_entrada)},ultima_entrada),
          updated_at=NOW()
        WHERE sku=${sku}`;
      return res.status(200).json({ updated: 1 });
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { sku } = req.query;
      if (!sku) return res.status(400).json({ error: 'SKU requerido' });
      await sql`DELETE FROM articulos WHERE sku=${sku}`;
      return res.status(200).json({ deleted: 1 });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch(err) {
    console.error('[API articulos]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
