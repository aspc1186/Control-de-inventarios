// api/_db.js — Neon Serverless Postgres
const { neon } = require('@neondatabase/serverless');

function getSQL() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL not set in Vercel Environment Variables.');
  return neon(url);
}

async function setupTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS articulos (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      sku             TEXT NOT NULL UNIQUE,
      nombre          TEXT NOT NULL,
      descripcion     TEXT,
      categoria       TEXT,
      marca           TEXT,
      unidad          TEXT DEFAULT 'UND',
      ubicacion       TEXT,
      ubicacion_label TEXT,
      bodega_id       TEXT,
      stock           NUMERIC(12,2) DEFAULT 0,
      stock_minimo    NUMERIC(12,2) DEFAULT 0,
      stock_maximo    NUMERIC(12,2),
      costo           NUMERIC(14,4) DEFAULT 0,
      proveedor       TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      created_by      TEXT,
      ultima_entrada  TEXT,
      ultima_salida   TEXT,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )`;

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
      fecha            TEXT,
      hora             TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nombre        TEXT NOT NULL,
      documento     TEXT,
      correo        TEXT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      cargo         TEXT,
      area          TEXT,
      rol           TEXT DEFAULT 'CONSULTA',
      estado        TEXT DEFAULT 'ACTIVO',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS ubicaciones (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      nombre      TEXT NOT NULL,
      descripcion TEXT,
      pasillos    JSONB DEFAULT '[]',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`;

  // Admin user — password: Admin123! → hash: erp_1d6a1e67_8
  await sql`
    INSERT INTO usuarios (nombre, username, password_hash, rol)
    VALUES ('Administrador Sistema', 'admin', 'erp_1d6a1e67_8', 'ADMINISTRADOR')
    ON CONFLICT (username) DO NOTHING`;

  // 9 bodegas
  const letras = ['A','B','C'];
  for (let i = 1; i <= 9; i++) {
    const pasillos = letras.map(l => ({
      id: 'pa-'+l.toLowerCase(), nombre: 'Pasillo '+l,
      estantes: [1,2,3].map(e => ({
        id: 'e'+e, nombre: 'Estantería '+String(e).padStart(2,'0'),
        niveles: [1,2,3,4].map(n => ({
          id: 'n'+n, nombre: 'Nivel '+String(n).padStart(2,'0'),
          posiciones: [1,2,3,4,5].map(p => ({
            id: 'p'+p, nombre: 'Posición '+String(p).padStart(2,'0')
          }))
        }))
      }))
    }));
    await sql`
      INSERT INTO ubicaciones (id, nombre, descripcion, pasillos)
      VALUES (${'bod-'+i}, ${'Bodega '+i}, ${'Bodega de almacenamiento '+i}, ${JSON.stringify(pasillos)})
      ON CONFLICT DO NOTHING`;
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

module.exports = { getSQL, setupTables, cors };
