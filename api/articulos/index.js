// api/articulos/index.js — StockFlow WMS v2
// Maneja GET, POST (batch upsert), PUT (update single), DELETE, deactivate
const { getSQL, cors } = require('../_db');
const { normalizeMotoPartsProduct } = require('../../lib/motoparts-products');
const { normalizeMotorcycle, validateVin } = require('../../lib/motoparts-motorcycles');
const { normalizeMotoModel, normalizeCompatibility, queryTokens } = require('../../lib/motoparts-compatibility');


// Todos los campos del modelo — sincronizados con COL mapping del frontend
const CAMPOS_TEXTO = [
  'sku','nombre','descripcion','categoria','subcategoria','marca',
  'unidad','ubicacion','ubicacion_label','bodega','bodega_id',
  'proveedor','proveedores_alternos','estado','empresa_id','created_by',
  'ultima_entrada','ultima_salida','codigo_barras','metodo_seguridad',
  'referencia_fabricante','referencia_oem','referencias_alternas','marca_moto',
  'linea_moto','modelo_moto','cilindraje','anio_inicial','anio_final','vin',
  'numero_motor','proveedor_origen','ubicacion_motoparts','compatibilidad_moto',
  'tipo_repuesto','posicion_moto','foto_url','clase_abc',
];
const CAMPOS_NUMERO = [
  'stock','stock_minimo','stock_maximo','stock_reservado','stock_seguridad',
  'punto_reorden','consumo_diario','lead_time','dias_cobertura',
  'costo','precio','iva','rotacion',
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
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS stock_reservado NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS stock_seguridad  NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS punto_reorden   NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS consumo_diario   NUMERIC(14,4) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS lead_time        NUMERIC(8,0)  DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS dias_cobertura   NUMERIC(8,0)  DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS metodo_seguridad VARCHAR(20)   DEFAULT 'automatico'`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS subcategoria     VARCHAR(200)  DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS bodega           VARCHAR(200)  DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS precio           NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS iva              NUMERIC(6,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS proveedores_alternos TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS codigo_barras    VARCHAR(100)  DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS empresa_id       VARCHAR(100)`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS estado           TEXT DEFAULT 'Activo'`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ultima_entrada   TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ultima_salida    TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS referencia_fabricante TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS referencia_oem TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS referencias_alternas TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS marca_moto TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS linea_moto TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS modelo_moto TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS cilindraje TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS anio_inicial TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS anio_final TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS vin TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS numero_motor TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS proveedor_origen TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ubicacion_motoparts TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS compatibilidad_moto TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS tipo_repuesto TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS posicion_moto TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS foto_url TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS rotacion NUMERIC(14,4) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS clase_abc TEXT DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS motos_compatibles JSONB DEFAULT '[]'`;
  await sql`CREATE INDEX IF NOT EXISTS articulos_referencia_oem_idx ON articulos (referencia_oem)`;
  await sql`CREATE INDEX IF NOT EXISTS articulos_vin_idx ON articulos (vin)`;
  await sql`CREATE INDEX IF NOT EXISTS articulos_ubicacion_motoparts_idx ON articulos (ubicacion_motoparts)`;
  await sql`CREATE INDEX IF NOT EXISTS articulos_codigo_barras_idx ON articulos (codigo_barras)`;
  await sql`CREATE INDEX IF NOT EXISTS articulos_clase_abc_idx ON articulos (clase_abc)`;
}

async function ensureMotorcycleStorage(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS motoparts_motorcycles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      vin TEXT NOT NULL,
      numero_chasis TEXT,
      numero_motor TEXT,
      marca TEXT,
      linea TEXT,
      modelo TEXT,
      anio_modelo TEXT,
      cilindraje TEXT,
      color TEXT,
      tipo TEXT DEFAULT 'MOTOCICLETA',
      estado TEXT DEFAULT 'RECIBIDA',
      bodega TEXT,
      ubicacion_actual TEXT DEFAULT 'FANALCA',
      fecha_recepcion TEXT,
      proveedor TEXT,
      orden_compra TEXT,
      costo NUMERIC(14,4),
      precio_venta NUMERIC(14,2),
      cliente_reservado TEXT,
      estado_comercial TEXT DEFAULT 'DISPONIBLE',
      empresa_id TEXT,
      fecha_ultimo_movimiento TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS motoparts_motorcycles_vin_uidx ON motoparts_motorcycles (vin)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_motorcycles_empresa_idx ON motoparts_motorcycles (empresa_id)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_motorcycles_motor_idx ON motoparts_motorcycles (numero_motor)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_motorcycles_chasis_idx ON motoparts_motorcycles (numero_chasis)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_motorcycles_location_idx ON motoparts_motorcycles (ubicacion_actual)`;
}

async function ensureCompatibilityStorage(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS motoparts_motorcycle_models (
      id TEXT PRIMARY KEY,
      marca TEXT NOT NULL,
      linea TEXT NOT NULL,
      modelo TEXT,
      cilindraje TEXT,
      anio_desde TEXT,
      anio_hasta TEXT,
      version TEXT,
      motor TEXT,
      observaciones TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS motoparts_part_compatibility (
      id TEXT PRIMARY KEY,
      repuesto_id TEXT NOT NULL,
      motocicleta_modelo_id TEXT NOT NULL,
      observaciones TEXT,
      empresa_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_models_lookup_idx ON motoparts_motorcycle_models (marca, linea, modelo, cilindraje)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS motoparts_part_compatibility_uidx ON motoparts_part_compatibility (repuesto_id, motocicleta_modelo_id, COALESCE(empresa_id, '__GLOBAL__'))`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_part_compatibility_part_idx ON motoparts_part_compatibility (repuesto_id)`;
  await sql`CREATE INDEX IF NOT EXISTS motoparts_part_compatibility_model_idx ON motoparts_part_compatibility (motocicleta_modelo_id)`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  try {
    // Ensure columns exist on every request (cheap — uses IF NOT EXISTS)
    await ensureColumns(sql);

    const { action, limit = 5000, empresa_id, mode, vin } = req.query;

    if (mode === 'motorcycles') {
      await ensureMotorcycleStorage(sql);

      if (req.method === 'GET') {
        let rows;
        const v = vin ? validateVin(vin) : null;
        if (vin && !v.ok) return res.status(400).json({ ok: false, error: v.message });
        if (empresa_id && vin) {
          rows = await sql`SELECT * FROM motoparts_motorcycles WHERE empresa_id = ${empresa_id} AND vin = ${v.vin} ORDER BY updated_at DESC LIMIT ${parseInt(limit)}`;
        } else if (empresa_id) {
          rows = await sql`SELECT * FROM motoparts_motorcycles WHERE empresa_id = ${empresa_id} ORDER BY updated_at DESC LIMIT ${parseInt(limit)}`;
        } else if (vin) {
          rows = await sql`SELECT * FROM motoparts_motorcycles WHERE vin = ${v.vin} ORDER BY updated_at DESC LIMIT ${parseInt(limit)}`;
        } else {
          rows = await sql`SELECT * FROM motoparts_motorcycles ORDER BY updated_at DESC LIMIT ${parseInt(limit)}`;
        }
        return res.status(200).json({ ok: true, data: rows, total: rows.length });
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        const payload = normalizeMotorcycle(req.body || {});
        if (!payload.ok) return res.status(400).json({ ok: false, error: payload.message });
        if (!Number.isFinite(payload.costo) && payload.costo !== null) return res.status(400).json({ ok: false, error: 'Costo invalido.' });
        if (!Number.isFinite(payload.precio_venta) && payload.precio_venta !== null) return res.status(400).json({ ok: false, error: 'Precio de venta invalido.' });
        const rows = await sql`
          INSERT INTO motoparts_motorcycles (
            id, vin, numero_chasis, numero_motor, marca, linea, modelo, anio_modelo,
            cilindraje, color, tipo, estado, bodega, ubicacion_actual, fecha_recepcion,
            proveedor, orden_compra, costo, precio_venta, cliente_reservado,
            estado_comercial, empresa_id, fecha_ultimo_movimiento, updated_at
          ) VALUES (
            ${payload.id}, ${payload.vin}, ${payload.numero_chasis}, ${payload.numero_motor},
            ${payload.marca}, ${payload.linea}, ${payload.modelo}, ${payload.anio_modelo},
            ${payload.cilindraje}, ${payload.color}, ${payload.tipo}, ${payload.estado},
            ${payload.bodega}, ${payload.ubicacion_actual}, ${payload.fecha_recepcion},
            ${payload.proveedor}, ${payload.orden_compra}, ${payload.costo}, ${payload.precio_venta},
            ${payload.cliente_reservado}, ${payload.estado_comercial}, ${payload.empresa_id},
            NOW(), NOW()
          )
          ON CONFLICT (vin) DO UPDATE SET
            numero_chasis=EXCLUDED.numero_chasis,
            numero_motor=EXCLUDED.numero_motor,
            marca=EXCLUDED.marca,
            linea=EXCLUDED.linea,
            modelo=EXCLUDED.modelo,
            anio_modelo=EXCLUDED.anio_modelo,
            cilindraje=EXCLUDED.cilindraje,
            color=EXCLUDED.color,
            tipo=EXCLUDED.tipo,
            estado=EXCLUDED.estado,
            bodega=EXCLUDED.bodega,
            ubicacion_actual=EXCLUDED.ubicacion_actual,
            fecha_recepcion=EXCLUDED.fecha_recepcion,
            proveedor=EXCLUDED.proveedor,
            orden_compra=EXCLUDED.orden_compra,
            costo=EXCLUDED.costo,
            precio_venta=EXCLUDED.precio_venta,
            cliente_reservado=EXCLUDED.cliente_reservado,
            estado_comercial=EXCLUDED.estado_comercial,
            empresa_id=EXCLUDED.empresa_id,
            fecha_ultimo_movimiento=NOW(),
            updated_at=NOW()
          RETURNING *`;
        return res.status(200).json({ ok: true, data: rows[0], id: rows[0].id });
      }

      if (req.method === 'DELETE') {
        const validation = validateVin(vin);
        if (!validation.ok) return res.status(400).json({ ok: false, error: validation.message });
        const rows = await sql`
          UPDATE motoparts_motorcycles
          SET estado='BLOQUEADA', estado_comercial='NO DISPONIBLE', updated_at=NOW()
          WHERE vin=${validation.vin}
          RETURNING *`;
        return res.status(200).json({ ok: true, data: rows[0] || null });
      }
    }

    if (mode === 'compatibility') {
      await ensureCompatibilityStorage(sql);
      const actionName = String(action || '').toLowerCase();

      if (req.method === 'GET') {
        const q = String(req.query.q || '').trim();
        const tokens = queryTokens(q);
        let rows;
        if (q) {
          const like = `%${q}%`;
          rows = await sql`
            SELECT a.*,
                   m.id AS motocicleta_modelo_id,
                   m.marca AS moto_marca,
                   m.linea AS moto_linea,
                   m.modelo AS moto_modelo,
                   m.cilindraje AS moto_cilindraje,
                   m.anio_desde AS moto_anio_desde,
                   m.anio_hasta AS moto_anio_hasta,
                   c.observaciones AS compatibilidad_observaciones,
                   (COALESCE(a.stock,0) - COALESCE(a.stock_reservado,0)) AS stock_disponible
            FROM articulos a
            LEFT JOIN motoparts_part_compatibility c ON c.repuesto_id = a.sku
            LEFT JOIN motoparts_motorcycle_models m ON m.id = c.motocicleta_modelo_id
            WHERE (${empresa_id || null} IS NULL OR a.empresa_id = ${empresa_id || null})
              AND COALESCE(a.estado,'Activo') <> 'Inactivo'
              AND (
                a.sku ILIKE ${like} OR a.nombre ILIKE ${like} OR a.descripcion ILIKE ${like}
                OR a.referencia_oem ILIKE ${like} OR a.referencias_alternas ILIKE ${like}
                OR a.compatibilidad_moto ILIKE ${like} OR a.marca_moto ILIKE ${like}
                OR a.linea_moto ILIKE ${like} OR a.modelo_moto ILIKE ${like}
                OR m.marca ILIKE ${like} OR m.linea ILIKE ${like} OR m.modelo ILIKE ${like}
              )
            ORDER BY a.sku
            LIMIT ${parseInt(limit)}`;
        } else if (actionName === 'models') {
          rows = await sql`SELECT * FROM motoparts_motorcycle_models ORDER BY marca, linea, modelo LIMIT ${parseInt(limit)}`;
        } else {
          rows = await sql`
            SELECT c.*, m.marca, m.linea, m.modelo, m.cilindraje, m.anio_desde, m.anio_hasta
            FROM motoparts_part_compatibility c
            LEFT JOIN motoparts_motorcycle_models m ON m.id = c.motocicleta_modelo_id
            WHERE (${empresa_id || null} IS NULL OR c.empresa_id = ${empresa_id || null})
            ORDER BY c.updated_at DESC
            LIMIT ${parseInt(limit)}`;
        }
        if (tokens.length > 1 && rows.length) {
          const filtered = rows.filter((row) => {
            const haystack = queryTokens(Object.values(row).join(' '));
            return tokens.every((token) => haystack.some((h) => h.indexOf(token) >= 0 || token.indexOf(h) >= 0));
          });
          if (filtered.length) rows = filtered;
        }
        return res.status(200).json({ ok: true, data: rows, total: rows.length });
      }

      if (req.method === 'POST') {
        if (actionName === 'model') {
          const model = normalizeMotoModel(req.body || {});
          if (!model.ok) return res.status(400).json({ ok: false, error: model.error });
          const rows = await sql`
            INSERT INTO motoparts_motorcycle_models (
              id, marca, linea, modelo, cilindraje, anio_desde, anio_hasta, version, motor, observaciones, updated_at
            ) VALUES (
              ${model.id}, ${model.marca}, ${model.linea}, ${model.modelo}, ${model.cilindraje},
              ${model.anio_desde}, ${model.anio_hasta}, ${model.version}, ${model.motor}, ${model.observaciones}, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              marca=EXCLUDED.marca, linea=EXCLUDED.linea, modelo=EXCLUDED.modelo,
              cilindraje=EXCLUDED.cilindraje, anio_desde=EXCLUDED.anio_desde,
              anio_hasta=EXCLUDED.anio_hasta, version=EXCLUDED.version,
              motor=EXCLUDED.motor, observaciones=EXCLUDED.observaciones, updated_at=NOW()
            RETURNING *`;
          return res.status(200).json({ ok: true, data: rows[0], id: rows[0].id });
        }
        const comp = normalizeCompatibility(Object.assign({}, req.body, { empresa_id: req.body && (req.body.empresa_id || empresa_id) }));
        if (!comp.ok) return res.status(400).json({ ok: false, error: comp.error });
        const rows = await sql`
          INSERT INTO motoparts_part_compatibility (
            id, repuesto_id, motocicleta_modelo_id, observaciones, empresa_id, updated_at
          ) VALUES (
            ${comp.id}, ${comp.repuesto_id}, ${comp.motocicleta_modelo_id}, ${comp.observaciones}, ${comp.empresa_id}, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            repuesto_id=EXCLUDED.repuesto_id,
            motocicleta_modelo_id=EXCLUDED.motocicleta_modelo_id,
            observaciones=EXCLUDED.observaciones,
            empresa_id=EXCLUDED.empresa_id,
            updated_at=NOW()
          RETURNING *`;
        return res.status(200).json({ ok: true, data: rows[0], id: rows[0].id });
      }
    }

    // ── GET ───────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      let rows;
      if (empresa_id) {
        rows = await sql`
          SELECT *, (COALESCE(stock,0) - COALESCE(stock_reservado,0)) AS stock_disponible FROM articulos 
          WHERE empresa_id = ${empresa_id} AND estado != 'Inactivo'
          ORDER BY sku LIMIT ${parseInt(limit)}`;
      } else {
        rows = await sql`
          SELECT *, (COALESCE(stock,0) - COALESCE(stock_reservado,0)) AS stock_disponible FROM articulos 
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
          const proveedores_alt  = s(item.proveedores_alternos) || '';
          const estado           = s(item.estado)          || 'Activo';
          const empresa_id_v     = s(item.empresa_id)      || null;
          const created_by       = s(item.created_by)      || 'Sistema';
          const ultima_ent       = s(item.ultima_entrada)  || null;
          const ultima_sal       = s(item.ultima_salida)   || null;
          const metodo_seg       = s(item.metodo_seguridad)|| 'automatico';
          const codigo_barras    = s(item.codigo_barras)   || '';
          const moto             = normalizeMotoPartsProduct(item);
          const fotos_json       = JSON.stringify(moto.fotos || []);
          const motos_json       = JSON.stringify(moto.motos_compatibles || []);

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
          const iva              = n(item.iva)             ?? 0;
          const rotacion         = n(item.rotacion)        ?? 0;
          const clase_abc        = s(item.clase_abc || item.clasificacion_abc) || '';

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
                costo=${costo}, precio=${precio}, iva=${iva},
                proveedor=${proveedor}, proveedores_alternos=${proveedores_alt}, estado=${estado},
                empresa_id=COALESCE(${empresa_id_v}, empresa_id),
                ultima_entrada=COALESCE(${ultima_ent}, ultima_entrada),
                ultima_salida=COALESCE(${ultima_sal}, ultima_salida),
                codigo_barras=${codigo_barras},
                referencia_fabricante=${moto.referencia_fabricante},
                referencia_oem=${moto.referencia_oem},
                referencias_alternas=${moto.referencias_alternas},
                marca_moto=${moto.marca_moto},
                linea_moto=${moto.linea_moto},
                modelo_moto=${moto.modelo_moto},
                cilindraje=${moto.cilindraje},
                anio_inicial=${moto.anio_inicial},
                anio_final=${moto.anio_final},
                vin=${moto.vin},
                numero_motor=${moto.numero_motor},
                proveedor_origen=${moto.proveedor_origen},
                ubicacion_motoparts=${moto.ubicacion_motoparts},
                compatibilidad_moto=${moto.compatibilidad_moto},
                tipo_repuesto=${moto.tipo_repuesto},
                posicion_moto=${moto.posicion_moto},
                foto_url=${moto.foto_url},
                rotacion=${rotacion},
                clase_abc=${clase_abc},
                fotos=${fotos_json}::jsonb,
                motos_compatibles=${motos_json}::jsonb,
                created_by=${created_by}, updated_at=NOW()
              WHERE id=${existing[0].id}`;
            updated++;
          } else {
            await sql`
              INSERT INTO articulos (
                id, sku, nombre, descripcion, categoria, subcategoria,
                marca, unidad, ubicacion, ubicacion_label, bodega, bodega_id,
                stock, stock_minimo, stock_maximo, stock_reservado, stock_seguridad,
                punto_reorden, consumo_diario, lead_time, dias_cobertura, metodo_seguridad,
                costo, precio, iva, proveedor, proveedores_alternos, estado, empresa_id, created_by,
                ultima_entrada, ultima_salida, codigo_barras,
                referencia_fabricante, referencia_oem, referencias_alternas, marca_moto,
                linea_moto, modelo_moto, cilindraje, anio_inicial, anio_final, vin,
                numero_motor, proveedor_origen, ubicacion_motoparts, compatibilidad_moto,
                tipo_repuesto, posicion_moto, foto_url, rotacion, clase_abc, fotos, motos_compatibles,
                created_at, updated_at
              ) VALUES (
                ${id}, ${sku}, ${nombre}, ${descripcion}, ${categoria}, ${subcategoria},
                ${marca}, ${unidad}, ${ubicacion}, ${ubicacion_label}, ${bodega}, ${bodega_id},
                ${stock}, ${stock_min}, ${stock_max}, ${stock_res}, ${stock_seg},
                ${p_reorden}, ${consumo}, ${lead}, ${dias_cob}, ${metodo_seg},
                ${costo}, ${precio}, ${iva}, ${proveedor}, ${proveedores_alt}, ${estado}, ${empresa_id_v}, ${created_by},
                ${ultima_ent}, ${ultima_sal}, ${codigo_barras},
                ${moto.referencia_fabricante}, ${moto.referencia_oem}, ${moto.referencias_alternas}, ${moto.marca_moto},
                ${moto.linea_moto}, ${moto.modelo_moto}, ${moto.cilindraje}, ${moto.anio_inicial}, ${moto.anio_final}, ${moto.vin},
                ${moto.numero_motor}, ${moto.proveedor_origen}, ${moto.ubicacion_motoparts}, ${moto.compatibilidad_moto},
                ${moto.tipo_repuesto}, ${moto.posicion_moto}, ${moto.foto_url}, ${rotacion}, ${clase_abc}, ${fotos_json}::jsonb, ${motos_json}::jsonb,
                NOW(), NOW()
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
      const moto = normalizeMotoPartsProduct(item);
      const fotos_json = item.fotos === undefined && item.imagenes === undefined ? null : JSON.stringify(moto.fotos || []);
      const motos_json = item.motos_compatibles === undefined && item.compatibilidades === undefined ? null : JSON.stringify(moto.motos_compatibles || []);
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
          iva=COALESCE(${n(item.iva)},iva),
          proveedor=COALESCE(${s(item.proveedor)},proveedor),
          proveedores_alternos=COALESCE(${s(item.proveedores_alternos)},proveedores_alternos),
          estado=COALESCE(${s(item.estado)},estado),
          empresa_id=COALESCE(${s(item.empresa_id)},empresa_id),
          ultima_entrada=COALESCE(${s(item.ultima_entrada)},ultima_entrada),
          referencia_fabricante=COALESCE(${moto.referencia_fabricante},referencia_fabricante),
          referencia_oem=COALESCE(${moto.referencia_oem},referencia_oem),
          referencias_alternas=COALESCE(${moto.referencias_alternas},referencias_alternas),
          marca_moto=COALESCE(${moto.marca_moto},marca_moto),
          linea_moto=COALESCE(${moto.linea_moto},linea_moto),
          modelo_moto=COALESCE(${moto.modelo_moto},modelo_moto),
          cilindraje=COALESCE(${moto.cilindraje},cilindraje),
          anio_inicial=COALESCE(${moto.anio_inicial},anio_inicial),
          anio_final=COALESCE(${moto.anio_final},anio_final),
          vin=COALESCE(${moto.vin},vin),
          numero_motor=COALESCE(${moto.numero_motor},numero_motor),
          proveedor_origen=COALESCE(${moto.proveedor_origen},proveedor_origen),
          ubicacion_motoparts=COALESCE(${moto.ubicacion_motoparts},ubicacion_motoparts),
          compatibilidad_moto=COALESCE(${moto.compatibilidad_moto},compatibilidad_moto),
          tipo_repuesto=COALESCE(${moto.tipo_repuesto},tipo_repuesto),
          posicion_moto=COALESCE(${moto.posicion_moto},posicion_moto),
          foto_url=COALESCE(${moto.foto_url},foto_url),
          rotacion=COALESCE(${n(item.rotacion)},rotacion),
          clase_abc=COALESCE(${s(item.clase_abc || item.clasificacion_abc)},clase_abc),
          fotos=COALESCE(${fotos_json}::jsonb,fotos),
          motos_compatibles=COALESCE(${motos_json}::jsonb,motos_compatibles),
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
