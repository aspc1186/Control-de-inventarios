// api/movimientos/index.js — Movements: GET list + POST (update stock + register)
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString('es-CO', { year:'numeric', month:'2-digit', day:'2-digit' }),
    hora:  d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  };
}

async function ensureMovimientos(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS movimientos (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tipo             TEXT NOT NULL,
      sku              TEXT NOT NULL,
      articulo         TEXT NOT NULL,
      cantidad         NUMERIC(12,2) NOT NULL,
      stock_anterior   NUMERIC(12,2) NOT NULL,
      stock_resultante NUMERIC(12,2) NOT NULL,
      usuario          TEXT,
      observacion      TEXT,
      proveedor        TEXT,
      factura          TEXT,
      area             TEXT,
      empresa_id       TEXT,
      fecha            TEXT,
      hora             TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
}

function text(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

async function ensureCompras(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS compras (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      numero TEXT,
      proveedor TEXT,
      proveedor_id TEXT,
      estado TEXT DEFAULT 'BORRADOR',
      total NUMERIC(14,2) DEFAULT 0,
      items JSONB DEFAULT '[]',
      observaciones TEXT,
      empresa_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado_oc TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_recepcion TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_cierre TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS observacion_recepcion TEXT`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS factura_fotos JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS producto_fotos JSONB DEFAULT '[]'`;
  await sql`ALTER TABLE compras ADD COLUMN IF NOT EXISTS cerrada BOOLEAN DEFAULT FALSE`;
}

async function ensureRecepcionArticulos(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ubicacion_motoparts TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS stock_reservado NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS metodo_seguridad TEXT DEFAULT 'automatico'`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS ultima_entrada TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS codigo_barras TEXT DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activo'`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
}

async function ensureTraslados(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS traslados (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sku TEXT NOT NULL,
      nombre TEXT,
      cantidad NUMERIC(12,2) NOT NULL,
      origen TEXT,
      destino TEXT,
      usuario TEXT,
      observacion TEXT,
      empresa_id TEXT,
      fecha TEXT,
      hora TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
}

async function ensureWmsOperaciones(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`
    CREATE TABLE IF NOT EXISTS wms_operaciones (
      id TEXT PRIMARY KEY,
      recurso TEXT NOT NULL,
      estado TEXT,
      empresa_id TEXT,
      data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`ALTER TABLE wms_operaciones ADD COLUMN IF NOT EXISTS recurso TEXT`;
  await sql`ALTER TABLE wms_operaciones ADD COLUMN IF NOT EXISTS estado TEXT`;
  await sql`ALTER TABLE wms_operaciones ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE wms_operaciones ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE wms_operaciones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;
}

function normalizeCompraItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    sku: text(it.sku, ''),
    nombre: text(it.nombre || it.articulo, ''),
    cantidad: Number(it.cantidad || 0),
    costo: Number(it.costo || 0),
    total: Number(it.total || (Number(it.cantidad || 0) * Number(it.costo || 0))),
    ubicacion: text(it.ubicacion || it.ubicacion_motoparts, '')
  })).filter((it) => it.sku && it.cantidad > 0);
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();
  const recurso = req.query.recurso || req.query.resource || '';

  if (recurso === 'recepcion') {
    try {
      await ensureCompras(sql);
      await ensureMovimientos(sql);
      await ensureRecepcionArticulos(sql);
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

      const body = req.body || {};
      const empresaId = text(body.empresa_id);
      const lookup = text(body.oc_id || body.id || body.numero);
      if (!lookup) return res.status(400).json({ ok: false, error: 'OC requerida' });

      const compras = empresaId && empresaId !== '__SA__'
        ? await sql`SELECT * FROM compras WHERE empresa_id=${empresaId} AND (id=${lookup} OR numero=${lookup}) LIMIT 1`
        : await sql`SELECT * FROM compras WHERE id=${lookup} OR numero=${lookup} LIMIT 1`;
      if (!compras.length) return res.status(404).json({ ok: false, error: 'Orden de compra no encontrada' });

      const compra = compras[0];
      const items = normalizeCompraItems(body.items && body.items.length ? body.items : compra.items);
      if (!items.length) return res.status(400).json({ ok: false, error: 'La recepcion no tiene items validos' });

      const { fecha, hora } = nowParts();
      const proveedor = text(body.proveedor, compra.proveedor || '');
      const usuario = text(body.usuario, 'Sistema');
      const factura = text(body.factura, compra.numero || compra.id);
      const obs = text(body.observacion || body.observacion_recepcion, '');
      const savedMovs = [];
      const updatedItems = [];

      for (const item of items) {
        const sku = item.sku.toUpperCase();
        const existing = await sql`SELECT sku, nombre, stock, empresa_id FROM articulos WHERE sku=${sku} LIMIT 1`;
        const anterior = existing.length ? Number(existing[0].stock || 0) : 0;
        const qty = Number(item.cantidad || 0);
        const nuevo = anterior + qty;
        const nombre = item.nombre || (existing[0] && existing[0].nombre) || sku;
        const ubicacion = item.ubicacion || '';

        const arts = await sql`
          INSERT INTO articulos (
            sku, nombre, descripcion, unidad, ubicacion, ubicacion_motoparts, stock, costo,
            proveedor, estado, empresa_id, ultima_entrada, created_by, updated_at
          ) VALUES (
            ${sku}, ${nombre}, ${nombre}, 'UND', ${ubicacion}, ${ubicacion}, ${qty}, ${Number(item.costo || 0)},
            ${proveedor}, 'Activo', ${empresaId || compra.empresa_id || null}, ${fecha}, ${usuario}, NOW()
          )
          ON CONFLICT (sku) DO UPDATE SET
            nombre=COALESCE(NULLIF(EXCLUDED.nombre,''), articulos.nombre),
            descripcion=COALESCE(NULLIF(EXCLUDED.descripcion,''), articulos.descripcion),
            ubicacion=COALESCE(NULLIF(EXCLUDED.ubicacion,''), articulos.ubicacion),
            ubicacion_motoparts=COALESCE(NULLIF(EXCLUDED.ubicacion_motoparts,''), articulos.ubicacion_motoparts),
            stock=COALESCE(articulos.stock,0) + EXCLUDED.stock,
            costo=CASE WHEN EXCLUDED.costo > 0 THEN EXCLUDED.costo ELSE articulos.costo END,
            proveedor=COALESCE(NULLIF(EXCLUDED.proveedor,''), articulos.proveedor),
            estado='Activo',
            empresa_id=COALESCE(articulos.empresa_id, EXCLUDED.empresa_id),
            ultima_entrada=${fecha},
            updated_at=NOW()
          RETURNING *`;

        const movRows = await sql`
          INSERT INTO movimientos
            (tipo, sku, articulo, cantidad, stock_anterior, stock_resultante,
             usuario, observacion, proveedor, factura, area, empresa_id, fecha, hora)
          VALUES (
            'ENTRADA', ${sku}, ${nombre}, ${qty}, ${anterior}, ${nuevo},
            ${usuario}, ${obs || `Ingreso por OC ${factura}`}, ${proveedor}, ${factura}, 'RECEPCION',
            ${empresaId || compra.empresa_id || null}, ${fecha}, ${hora}
          )
          RETURNING *`;
        updatedItems.push(arts[0]);
        savedMovs.push(movRows[0]);
      }

      const total = items.reduce((sum, it) => sum + Number(it.total || (Number(it.cantidad || 0) * Number(it.costo || 0))), 0);
      const facturaFotos = Array.isArray(body.factura_fotos) ? body.factura_fotos.slice(0, 8) : [];
      const productoFotos = Array.isArray(body.producto_fotos) ? body.producto_fotos.slice(0, 8) : [];
      const updatedCompra = await sql`
        UPDATE compras SET
          proveedor=${proveedor},
          estado='INGRESO',
          estado_oc='INGRESO',
          total=${total},
          items=${JSON.stringify(items)}::jsonb,
          observacion_recepcion=${obs},
          factura_fotos=${JSON.stringify(facturaFotos)}::jsonb,
          producto_fotos=${JSON.stringify(productoFotos)}::jsonb,
          fecha_recepcion=NOW()::text,
          fecha_cierre=NOW()::text,
          cerrada=TRUE,
          updated_at=NOW()
        WHERE id=${compra.id}
        RETURNING *`;

      return res.status(200).json({ ok: true, compra: updatedCompra[0], items: updatedItems, movimientos: savedMovs, count: savedMovs.length });
    } catch (err) {
      console.error('[recepcion via movimientos]', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (recurso === 'compras') {
    try {
      await ensureCompras(sql);
      if (req.method === 'GET') {
        const { empresa_id } = req.query;
        const rows = empresa_id && empresa_id !== '__SA__'
          ? await sql`SELECT * FROM compras WHERE empresa_id = ${empresa_id} ORDER BY created_at DESC LIMIT 1000`
          : await sql`SELECT * FROM compras ORDER BY created_at DESC LIMIT 1000`;
        return res.status(200).json({ ok: true, data: rows, total: rows.length });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const body = req.body || {};
        const items = normalizeCompraItems(body.items);
        const total = body.total === undefined || body.total === null || body.total === ''
          ? items.reduce((sum, it) => sum + Number(it.total || 0), 0)
          : Number(body.total || 0);
        const id = text(body.id) || randomUUID();
        const numero = text(body.numero) || `OC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-5)}`;
        const existing = await sql`SELECT id FROM compras WHERE id = ${id} LIMIT 1`;
        if (existing.length) {
          await sql`
            UPDATE compras SET numero=${numero}, proveedor=${text(body.proveedor)}, proveedor_id=${text(body.proveedor_id)},
              estado=${text(body.estado, 'BORRADOR')}, total=${total}, items=${JSON.stringify(items)}::jsonb,
              observaciones=${text(body.observaciones)}, empresa_id=${text(body.empresa_id)}, updated_at=NOW()
            WHERE id=${id}`;
          return res.status(200).json({ ok: true, id, numero, updated: true });
        }
        await sql`
          INSERT INTO compras (id, numero, proveedor, proveedor_id, estado, total, items, observaciones, empresa_id, created_at, updated_at)
          VALUES (${id}, ${numero}, ${text(body.proveedor)}, ${text(body.proveedor_id)}, ${text(body.estado, 'BORRADOR')},
                  ${total}, ${JSON.stringify(items)}::jsonb, ${text(body.observaciones)}, ${text(body.empresa_id)}, NOW(), NOW())`;
        return res.status(200).json({ ok: true, id, numero, inserted: true });
      }
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    } catch (err) {
      console.error('[compras via movimientos]', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (recurso === 'traslados') {
    try {
      await ensureTraslados(sql);
      if (req.method === 'GET') {
        const { empresa_id, limit = 1000 } = req.query;
        const lim = Math.min(Number(limit) || 1000, 5000);
        const rows = empresa_id && empresa_id !== '__SA__'
          ? await sql`SELECT * FROM traslados WHERE empresa_id = ${empresa_id} ORDER BY created_at DESC LIMIT ${lim}`
          : await sql`SELECT * FROM traslados ORDER BY created_at DESC LIMIT ${lim}`;
        return res.status(200).json({ ok: true, data: rows, total: rows.length });
      }
      if (req.method === 'POST') {
        const body = req.body || {};
        if (!body.sku) return res.status(400).json({ ok: false, error: 'sku requerido' });
        const qty = Number(body.cantidad || 0);
        if (!qty || qty <= 0) return res.status(400).json({ ok: false, error: 'cantidad debe ser > 0' });
        const t = nowParts();
        const id = text(body.id) || randomUUID();
        const rows = await sql`
          INSERT INTO traslados (id, sku, nombre, cantidad, origen, destino, usuario, observacion, empresa_id, fecha, hora, created_at)
          VALUES (${id}, ${text(body.sku).toUpperCase()}, ${text(body.nombre)}, ${qty}, ${text(body.origen)}, ${text(body.destino)},
                  ${text(body.usuario, 'Sistema')}, ${text(body.observacion)}, ${text(body.empresa_id)},
                  ${text(body.fecha, t.fecha)}, ${text(body.hora, t.hora)}, NOW())
          RETURNING *`;
        return res.status(200).json({ ok: true, id: rows[0].id, data: rows[0] });
      }
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    } catch (err) {
      console.error('[traslados via movimientos]', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // ── GET ──────────────────────────────────────────────────────────────────
  if (['pedidos','clientes','picking','packing','guias','despachos','remisiones','auditoria','seguridad'].includes(recurso)) {
    try {
      await ensureWmsOperaciones(sql);
      if (req.method === 'GET') {
        const { empresa_id, limit = 1000 } = req.query;
        const lim = Math.min(Number(limit) || 1000, 5000);
        const rows = empresa_id && empresa_id !== '__SA__'
          ? await sql`SELECT id, recurso, estado, empresa_id, data, created_at, updated_at FROM wms_operaciones WHERE recurso = ${recurso} AND empresa_id = ${empresa_id} ORDER BY updated_at DESC LIMIT ${lim}`
          : await sql`SELECT id, recurso, estado, empresa_id, data, created_at, updated_at FROM wms_operaciones WHERE recurso = ${recurso} ORDER BY updated_at DESC LIMIT ${lim}`;
        return res.status(200).json({
          ok: true,
          data: rows.map((r) => ({ ...r.data, id: r.id, recurso: r.recurso, estado: r.estado || (r.data && r.data.estado), empresa_id: r.empresa_id || (r.data && r.data.empresa_id), created_at: r.created_at, updated_at: r.updated_at })),
          total: rows.length
        });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const body = req.body || {};
        const items = Array.isArray(body) ? body : [body];
        const saved = [];
        for (const item of items) {
          const id = text(item.id) || randomUUID();
          const estado = text(item.estado);
          const empresaId = text(item.empresa_id);
          const data = { ...item, id };
          const existing = await sql`SELECT id FROM wms_operaciones WHERE id = ${id} LIMIT 1`;
          if (existing.length) {
            await sql`UPDATE wms_operaciones SET recurso=${recurso}, estado=${estado}, empresa_id=${empresaId}, data=${JSON.stringify(data)}::jsonb, updated_at=NOW() WHERE id=${id}`;
          } else {
            await sql`INSERT INTO wms_operaciones (id, recurso, estado, empresa_id, data, created_at, updated_at) VALUES (${id}, ${recurso}, ${estado}, ${empresaId}, ${JSON.stringify(data)}::jsonb, NOW(), NOW())`;
          }
          saved.push(id);
        }
        return res.status(200).json({ ok: true, count: saved.length, ids: saved, id: saved.length === 1 ? saved[0] : undefined });
      }
      if (req.method === 'DELETE') {
        const { id, empresa_id } = req.query;
        if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
        if (empresa_id && empresa_id !== '__SA__') {
          await sql`DELETE FROM wms_operaciones WHERE recurso = ${recurso} AND id = ${id} AND empresa_id = ${empresa_id}`;
        } else {
          await sql`DELETE FROM wms_operaciones WHERE recurso = ${recurso} AND id = ${id}`;
        }
        return res.status(200).json({ ok: true });
      }
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    } catch (err) {
      console.error('[wms via movimientos]', recurso, err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      await ensureMovimientos(sql);
      const { sku, tipo, usuario, empresa_id, limit = 2000, offset = 0 } = req.query;
      const lim = Math.min(Number(limit) || 2000, 5000);
      const off = Number(offset) || 0;

      let rows;
      if (empresa_id && empresa_id !== '__SA__' && sku && tipo) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE empresa_id = ${empresa_id} AND sku = ${sku.toUpperCase()} AND tipo = ${tipo}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (empresa_id && empresa_id !== '__SA__' && sku) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE empresa_id = ${empresa_id} AND sku = ${sku.toUpperCase()}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (empresa_id && empresa_id !== '__SA__' && tipo) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE empresa_id = ${empresa_id} AND tipo = ${tipo}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (empresa_id && empresa_id !== '__SA__') {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE empresa_id = ${empresa_id}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (sku && tipo) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE sku = ${sku.toUpperCase()} AND tipo = ${tipo}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (sku) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE sku = ${sku.toUpperCase()}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (tipo) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE tipo = ${tipo}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else if (usuario) {
        rows = await sql`
          SELECT * FROM movimientos
          WHERE usuario ILIKE ${'%'+usuario+'%'}
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      } else {
        rows = await sql`
          SELECT * FROM movimientos
          ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`;
      }
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      console.error('[GET /movimientos]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    await ensureMovimientos(sql);
    const { tipo, sku, cantidad, usuario, observacion, proveedor, factura, area, empresa_id } = req.body || {};

    // Validate inputs
    if (!tipo)  return res.status(400).json({ error: 'tipo es requerido' });
    if (!sku)   return res.status(400).json({ error: 'sku es requerido' });
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'cantidad debe ser > 0' });

    const skuUp = sku.trim().toUpperCase();

    try {
      // 1. Get current article
      const arts = await sql`
        SELECT id, sku, nombre, stock, stock_reservado, empresa_id
        FROM articulos WHERE sku = ${skuUp}`;

      if (!arts.length) {
        return res.status(404).json({ error: `SKU ${skuUp} no encontrado` });
      }

      const art      = arts[0];
      const anterior = Number(art.stock || 0);
      const reservado= Number(art.stock_reservado || 0);
      const disp     = Math.max(0, anterior - reservado);
      const isEntry  = ['ENTRADA','AJUSTE_POS','TRASLADO_ENT'].includes(tipo);
      const isSalida = ['SALIDA','AJUSTE_NEG','TRASLADO_SAL'].includes(tipo);

      // 2. Validate stock
      if (isSalida && qty > disp) {
        return res.status(400).json({
          ok: false,
          error: `Stock insuficiente. Disponible: ${disp} | Actual: ${anterior} | Reservado: ${reservado}`
        });
      }

      // 3. Calculate new stock
      const nuevo = isEntry
        ? anterior + qty
        : Math.max(0, anterior - qty);

      const { fecha, hora } = nowParts();

      // 4. Update article stock (this is the critical step)
      const updated = await sql`
        UPDATE articulos
        SET
          stock        = ${nuevo},
          updated_at   = NOW(),
          ultima_entrada = CASE WHEN ${tipo} = 'ENTRADA' THEN ${fecha} ELSE ultima_entrada END,
          ultima_salida  = CASE WHEN ${tipo} = 'SALIDA'  THEN ${fecha} ELSE ultima_salida  END
        WHERE sku = ${skuUp}
        RETURNING sku, stock`;

      if (!updated.length) {
        return res.status(500).json({ error: 'No se pudo actualizar el stock' });
      }

      const stockConfirmado = Number(updated[0].stock);
      const empresaId = empresa_id && empresa_id !== '__SA__' ? empresa_id : (art.empresa_id || null);

      // 5. Register movement
      const movRows = await sql`
        INSERT INTO movimientos
          (tipo, sku, articulo, cantidad, stock_anterior, stock_resultante,
           usuario, observacion, proveedor, factura, area, empresa_id, fecha, hora)
        VALUES (
          ${tipo}, ${skuUp}, ${art.nombre}, ${qty},
          ${anterior}, ${stockConfirmado},
          ${usuario    || 'Sistema'},
          ${observacion|| null},
          ${proveedor  || null},
          ${factura    || null},
          ${area       || null},
          ${empresaId},
          ${fecha}, ${hora}
        )
        RETURNING *`;

      return res.status(201).json({
        ok:             true,
        mov:            movRows[0],
        sku:            skuUp,
        articulo:       art.nombre,
        stock_anterior: anterior,
        stock_nuevo:    stockConfirmado,
        diferencia:     isEntry ? qty : -qty,
      });

    } catch (err) {
      console.error('[POST /movimientos] Error:', err.message, '| SKU:', sku, '| tipo:', tipo);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
