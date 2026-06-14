// api/articulos/batch.js — Smart upsert with import modes
// Stock Mínimo y Stock Máximo ALWAYS updated from file (Excel is source of truth)
const { getSQL, cors } = require('../_db');

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString('es-CO', {year:'numeric',month:'2-digit',day:'2-digit'}),
    hora:  d.toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  };
}

function safeNum(v, fallback=0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function safeMax(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { items, mode = 'todos_campos' } = req.body || {};
  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array required' });
  }

  const sql = getSQL();
  let inserted = 0, updated = 0, errors = [];

  for (const b of items) {
    if (!b.sku || !b.nombre) continue;
    const sku = b.sku.toUpperCase();

    try {
      const existing = await sql`SELECT * FROM articulos WHERE sku = ${sku}`;
      const ex = existing[0];
      const { fecha, hora } = nowParts();
      const createdBy  = b.created_by || 'Sistema';

      // Parse all stock fields — Excel is always source of truth
      const stock      = safeNum(b.stock, 0);
      const stockRes   = safeNum(b.stock_reservado, 0);
      const stockMin   = safeNum(b.stock_minimo, 0);
      const stockMax   = safeMax(b.stock_maximo);  // null if empty
      const stockSeg   = safeNum(b.stock_seguridad, stockMin); // default = min
      const preorden   = safeNum(b.punto_reorden, stockMin + stockSeg);
      const costo      = safeNum(b.costo, 0);

      if (!ex) {
        // ── INSERT NEW ────────────────────────────────────────────
        if (mode === 'solo_existentes') continue;

        await sql`
          INSERT INTO articulos
            (sku, nombre, descripcion, categoria, marca, unidad,
             ubicacion, bodega_id, estado,
             stock, stock_reservado, stock_minimo, stock_maximo,
             costo, proveedor, created_by, updated_at)
          VALUES (
            ${sku}, ${b.nombre},
            ${b.descripcion||null}, ${b.categoria||null}, ${b.marca||null},
            ${b.unidad||'UND'},
            ${b.ubicacion||null}, ${b.bodega||null}, 'Activo',
            ${stock}, ${stockRes}, ${stockMin}, ${stockMax},
            ${costo}, ${b.proveedor||null}, ${createdBy}, NOW()
          )`;

        if (stock > 0) {
          await sql`
            INSERT INTO movimientos
              (tipo,sku,articulo,cantidad,stock_anterior,stock_resultante,usuario,observacion,fecha,hora)
            VALUES ('ENTRADA',${sku},${b.nombre},${stock},0,${stock},
                    ${createdBy},'Stock inicial - importación masiva',${fecha},${hora})`;
        }
        inserted++;

      } else {
        // ── UPDATE EXISTING ───────────────────────────────────────
        if (mode === 'solo_nuevos') continue;

        const stockActual = safeNum(ex.stock, 0);
        let stockNuevo;

        if (mode === 'sumar')       stockNuevo = stockActual + stock;
        else if (mode === 'restar') stockNuevo = Math.max(0, stockActual - stock);
        else                        stockNuevo = stock; // reemplazar, todos_campos, sync

        // Stock Mínimo y Máximo: ALWAYS update from file
        // (Excel es fuente oficial según requerimiento)
        const nuevoMin = stockMin >= 0 ? stockMin : safeNum(ex.stock_minimo, 0);
        const nuevoMax = stockMax !== null ? stockMax : (ex.stock_maximo ?? null);

        await sql`
          UPDATE articulos SET
            stock           = ${stockNuevo},
            stock_reservado = ${stockRes},
            stock_minimo    = ${nuevoMin},
            stock_maximo    = ${nuevoMax},
            costo           = CASE WHEN ${costo} > 0 THEN ${costo} ELSE costo END,
            nombre          = ${b.nombre},
            descripcion     = COALESCE(${b.descripcion||null}, descripcion),
            categoria       = COALESCE(${b.categoria||null},   categoria),
            marca           = COALESCE(${b.marca||null},       marca),
            unidad          = COALESCE(NULLIF(${b.unidad||''},''), unidad, 'UND'),
            ubicacion       = COALESCE(${b.ubicacion||null},   ubicacion),
            proveedor       = COALESCE(${b.proveedor||null},   proveedor),
            estado          = 'Activo',
            updated_at      = NOW()
          WHERE sku = ${sku}`;

        // Register movement if stock changed
        if (stockNuevo !== stockActual) {
          let tipo, diff;
          if (mode === 'sumar')       { tipo = 'ENTRADA';    diff = stock; }
          else if (mode === 'restar') { tipo = 'SALIDA';     diff = Math.min(stockActual, stock); }
          else {
            tipo = stockNuevo > stockActual ? 'AJUSTE_POS' : 'AJUSTE_NEG';
            diff = Math.abs(stockNuevo - stockActual);
          }
          await sql`
            INSERT INTO movimientos
              (tipo,sku,articulo,cantidad,stock_anterior,stock_resultante,usuario,observacion,fecha,hora)
            VALUES (${tipo},${sku},${ex.nombre||b.nombre},${diff},${stockActual},${stockNuevo},
                    ${createdBy},'Importación masiva - modo: ${mode}',${fecha},${hora})`;
        }
        updated++;
      }

    } catch (err) {
      errors.push({ sku: b.sku, error: err.message });
      if (errors.length > 30) break;
    }
  }

  res.json({ ok: true, inserted, updated, errors, total: items.length });
};
