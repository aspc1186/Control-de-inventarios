// api/articulos/batch.js — Smart upsert with import modes
const { getSQL, cors } = require('../_db');

function nowParts() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString('es-CO', {year:'numeric',month:'2-digit',day:'2-digit'}),
    hora:  d.toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  };
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { items, mode = 'reemplazar' } = req.body || {};
  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items array required' });
  }

  const sql = getSQL();
  let inserted = 0, updated = 0, errors = [];

  for (const b of items) {
    if (!b.sku || !b.nombre) continue;
    const sku = b.sku.toUpperCase();

    try {
      // Check if exists
      const existing = await sql`SELECT * FROM articulos WHERE sku = ${sku}`;
      const ex = existing[0];
      const { fecha, hora } = nowParts();
      const createdBy = b.created_by || 'Sistema';

      if (!ex) {
        // ── INSERT NEW ────────────────────────────────────────────────
        if (mode === 'solo_existentes') continue; // skip new items

        const stock = Math.max(0, Number(b.stock) || 0);

        await sql`
          INSERT INTO articulos
            (sku, nombre, descripcion, categoria, marca, unidad,
             ubicacion, bodega_id, stock, stock_reservado,
             stock_minimo, stock_maximo, costo, proveedor, created_by, updated_at)
          VALUES (
            ${sku}, ${b.nombre}, ${b.descripcion||null}, ${b.categoria||null},
            ${b.marca||null}, ${b.unidad||'UND'},
            ${b.ubicacion||null}, ${b.bodega||null},
            ${stock}, ${Number(b.stock_reservado)||0},
            ${Number(b.stock_minimo)||0},
            ${b.stock_maximo!=null&&b.stock_maximo!==''?Number(b.stock_maximo):null},
            ${Number(b.costo)||0}, ${b.proveedor||null},
            ${createdBy}, NOW()
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
        // ── UPDATE EXISTING ───────────────────────────────────────────
        if (mode === 'solo_nuevos') continue; // skip existing

        const stockActual = Number(ex.stock) || 0;
        const stockArchivo = Math.max(0, Number(b.stock) || 0);
        let stockNuevo;

        if (mode === 'sumar')    stockNuevo = stockActual + stockArchivo;
        else if (mode === 'restar') stockNuevo = Math.max(0, stockActual - stockArchivo);
        else stockNuevo = stockArchivo; // reemplazar, todos_campos, solo_existentes

        const updateAllFields = (mode === 'todos_campos');

        await sql`
          UPDATE articulos SET
            stock        = ${stockNuevo},
            stock_reservado = ${Number(b.stock_reservado)||Number(ex.stock_reservado)||0},
            stock_minimo = CASE WHEN ${Number(b.stock_minimo)||0} > 0
                           THEN ${Number(b.stock_minimo)||0}
                           ELSE stock_minimo END,
            stock_maximo = CASE WHEN ${b.stock_maximo!=null&&b.stock_maximo!==''?Number(b.stock_maximo):null} IS NOT NULL
                           THEN ${b.stock_maximo!=null&&b.stock_maximo!==''?Number(b.stock_maximo):null}
                           ELSE stock_maximo END,
            nombre       = CASE WHEN ${updateAllFields}::boolean
                           THEN ${b.nombre} ELSE nombre END,
            descripcion  = CASE WHEN ${updateAllFields}::boolean AND ${b.descripcion||null} IS NOT NULL
                           THEN ${b.descripcion||null} ELSE descripcion END,
            categoria    = CASE WHEN ${updateAllFields}::boolean AND ${b.categoria||null} IS NOT NULL
                           THEN ${b.categoria||null} ELSE categoria END,
            marca        = CASE WHEN ${updateAllFields}::boolean AND ${b.marca||null} IS NOT NULL
                           THEN ${b.marca||null} ELSE marca END,
            unidad       = CASE WHEN ${updateAllFields}::boolean
                           THEN ${b.unidad||'UND'} ELSE unidad END,
            ubicacion    = CASE WHEN ${updateAllFields}::boolean AND ${b.ubicacion||null} IS NOT NULL
                           THEN ${b.ubicacion||null} ELSE ubicacion END,
            costo        = CASE WHEN ${updateAllFields}::boolean AND ${Number(b.costo)||0} > 0
                           THEN ${Number(b.costo)||0} ELSE costo END,
            proveedor    = CASE WHEN ${updateAllFields}::boolean AND ${b.proveedor||null} IS NOT NULL
                           THEN ${b.proveedor||null} ELSE proveedor END,
            updated_at   = NOW()
          WHERE sku = ${sku}`;

        // Register movement if stock changed
        if (stockNuevo !== stockActual) {
          let tipo, diff;
          if (mode === 'sumar')  { tipo = 'ENTRADA';    diff = stockArchivo; }
          else if (mode === 'restar') { tipo = 'SALIDA'; diff = Math.min(stockActual, stockArchivo); }
          else {
            tipo = stockNuevo > stockActual ? 'AJUSTE_POS' : 'AJUSTE_NEG';
            diff = Math.abs(stockNuevo - stockActual);
          }
          await sql`
            INSERT INTO movimientos
              (tipo,sku,articulo,cantidad,stock_anterior,stock_resultante,usuario,observacion,fecha,hora)
            VALUES (${tipo},${sku},${ex.nombre||b.nombre},${diff},${stockActual},${stockNuevo},
                    ${createdBy},'Importación masiva - modo: ' + ${mode},${fecha},${hora})`;
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
