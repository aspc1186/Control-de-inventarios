// api/movimientos/index.js — Movements: GET list + POST (update stock + register)
const { getSQL, cors } = require('../_db');

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString('es-CO', { year:'numeric', month:'2-digit', day:'2-digit' }),
    hora:  d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { sku, tipo, usuario, limit = 2000, offset = 0 } = req.query;
      const lim = Math.min(Number(limit) || 2000, 5000);
      const off = Number(offset) || 0;

      let rows;
      if (sku && tipo) {
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
    const { tipo, sku, cantidad, usuario, observacion, proveedor, factura, area } = req.body || {};

    // Validate inputs
    if (!tipo)  return res.status(400).json({ error: 'tipo es requerido' });
    if (!sku)   return res.status(400).json({ error: 'sku es requerido' });
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'cantidad debe ser > 0' });

    const skuUp = sku.trim().toUpperCase();

    try {
      // 1. Get current article
      const arts = await sql`
        SELECT id, sku, nombre, stock, stock_reservado
        FROM articulos WHERE sku = ${skuUp}`;

      if (!arts.length) {
        return res.status(404).json({ error: `SKU ${skuUp} no encontrado` });
      }

      const art      = arts[0];
      const anterior = Number(art.stock || 0);
      const reservado= Number(art.stock_reservado || 0);
      const disp     = Math.max(0, anterior - reservado);
      const isEntry  = ['ENTRADA','AJUSTE_POS'].includes(tipo);
      const isSalida = ['SALIDA','AJUSTE_NEG'].includes(tipo);

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

      // 5. Register movement
      const movRows = await sql`
        INSERT INTO movimientos
          (tipo, sku, articulo, cantidad, stock_anterior, stock_resultante,
           usuario, observacion, proveedor, factura, area, fecha, hora)
        VALUES (
          ${tipo}, ${skuUp}, ${art.nombre}, ${qty},
          ${anterior}, ${stockConfirmado},
          ${usuario    || 'Sistema'},
          ${observacion|| null},
          ${proveedor  || null},
          ${factura    || null},
          ${area       || null},
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
