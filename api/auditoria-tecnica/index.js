// api/auditoria-tecnica/index.js
// StockFlow WMS — Auditoría Técnica Automática
// Métodos: GET (listar), POST (registrar), DELETE (limpiar)

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

/* ── Crear tabla si no existe ─────────────────────────────────────── */
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS auditoria_tecnica (
      id            SERIAL PRIMARY KEY,
      empresa_id    VARCHAR(100),
      fecha         DATE          NOT NULL DEFAULT CURRENT_DATE,
      hora          VARCHAR(20),
      usuario       VARCHAR(200),
      modulo        VARCHAR(200),
      tipo_error    VARCHAR(50),
      descripcion   TEXT,
      solucion_aplicada TEXT,
      timestamp     BIGINT,
      created_at    TIMESTAMP     DEFAULT NOW()
    )
  `;
  // Índices para consultas frecuentes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_empresa    ON auditoria_tecnica(empresa_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_tipo       ON auditoria_tecnica(tipo_error)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_created    ON auditoria_tecnica(created_at DESC)
  `;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTable();

    /* ── GET — Listar registros ──────────────────────────────────── */
    if (req.method === 'GET') {
      const { empresa_id, tipo, limite = '100', desde } = req.query;

      let rows;

      if (empresa_id && tipo && desde) {
        rows = await sql`
          SELECT * FROM auditoria_tecnica
          WHERE empresa_id = ${empresa_id}
            AND tipo_error = ${tipo}
            AND created_at >= ${desde}::timestamp
          ORDER BY created_at DESC
          LIMIT ${parseInt(limite)}
        `;
      } else if (empresa_id && tipo) {
        rows = await sql`
          SELECT * FROM auditoria_tecnica
          WHERE empresa_id = ${empresa_id}
            AND tipo_error = ${tipo}
          ORDER BY created_at DESC
          LIMIT ${parseInt(limite)}
        `;
      } else if (empresa_id) {
        rows = await sql`
          SELECT * FROM auditoria_tecnica
          WHERE empresa_id = ${empresa_id}
          ORDER BY created_at DESC
          LIMIT ${parseInt(limite)}
        `;
      } else {
        rows = await sql`
          SELECT * FROM auditoria_tecnica
          ORDER BY created_at DESC
          LIMIT ${parseInt(limite)}
        `;
      }

      // Estadísticas resumen
      const stats = await sql`
        SELECT
          tipo_error,
          COUNT(*)::int AS total,
          MAX(created_at)  AS ultimo
        FROM auditoria_tecnica
        ${empresa_id ? sql`WHERE empresa_id = ${empresa_id}` : sql``}
        GROUP BY tipo_error
        ORDER BY total DESC
      `;

      return res.status(200).json({
        ok:     true,
        total:  rows.length,
        rows,
        stats,
      });
    }

    /* ── POST — Registrar evento de auditoría ────────────────────── */
    if (req.method === 'POST') {
      const body = req.body || {};

      // Aceptar tanto objeto único como array de eventos
      const eventos = Array.isArray(body) ? body : [body];
      const insertados = [];

      for (const ev of eventos) {
        const {
          empresa_id        = null,
          fecha             = new Date().toISOString().slice(0, 10),
          hora              = new Date().toLocaleTimeString('es-CO'),
          usuario           = 'Sistema',
          modulo            = 'General',
          tipo_error        = 'INFO',
          descripcion       = '',
          solucion_aplicada = '',
          timestamp         = Date.now(),
        } = ev;

        // Validar tipo permitido
        const tiposPermitidos = ['JS', 'JS_PROMISE', 'SQL', 'API', 'IMPORT', 'DASHBOARD',
                                  'PERMISOS', 'PLAN', 'TRIAL', 'CORRECCIÓN', 'PRUEBA', 'INFO'];
        const tipoFinal = tiposPermitidos.includes(tipo_error) ? tipo_error : 'INFO';

        const [row] = await sql`
          INSERT INTO auditoria_tecnica
            (empresa_id, fecha, hora, usuario, modulo, tipo_error, descripcion, solucion_aplicada, timestamp)
          VALUES
            (${empresa_id}, ${fecha}::date, ${hora}, ${usuario}, ${modulo},
             ${tipoFinal}, ${descripcion}, ${solucion_aplicada}, ${timestamp})
          RETURNING id, created_at
        `;
        insertados.push(row);
      }

      return res.status(201).json({
        ok:         true,
        insertados: insertados.length,
        ids:        insertados.map(r => r.id),
      });
    }

    /* ── DELETE — Limpiar registros antiguos ─────────────────────── */
    if (req.method === 'DELETE') {
      const { empresa_id, dias = '90' } = req.query;
      const diasNum = Math.max(7, parseInt(dias)); // mínimo 7 días

      let result;
      if (empresa_id) {
        result = await sql`
          DELETE FROM auditoria_tecnica
          WHERE empresa_id = ${empresa_id}
            AND created_at < NOW() - (${diasNum} || ' days')::interval
          RETURNING id
        `;
      } else {
        result = await sql`
          DELETE FROM auditoria_tecnica
          WHERE created_at < NOW() - (${diasNum} || ' days')::interval
          RETURNING id
        `;
      }

      return res.status(200).json({
        ok:        true,
        eliminados: result.length,
        mensaje:   `${result.length} registros anteriores a ${diasNum} días eliminados`,
      });
    }

    return res.status(405).json({ ok: false, error: 'Método no permitido' });

  } catch (err) {
    console.error('[auditoria-tecnica]', err);
    return res.status(500).json({
      ok:    false,
      error: err.message,
      hint:  'Verifica DATABASE_URL en variables de entorno de Vercel',
    });
  }
}
