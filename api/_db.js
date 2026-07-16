// api/_db.js — Neon Serverless Postgres
const { neon } = require('@neondatabase/serverless');

function getSQL() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL not set in Vercel Environment Variables.');
  return neon(url);
}

async function setupTables(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

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
      stock_reservado NUMERIC(12,2) DEFAULT 0,
      stock_seguridad NUMERIC(14,2) DEFAULT 0,
      punto_reorden   NUMERIC(14,2) DEFAULT 0,
      consumo_diario  NUMERIC(14,4) DEFAULT 0,
      lead_time       NUMERIC(8,0) DEFAULT 0,
      dias_cobertura  NUMERIC(8,0) DEFAULT 0,
      costo           NUMERIC(14,4) DEFAULT 0,
      precio          NUMERIC(14,2) DEFAULT 0,
      proveedor       TEXT,
      estado          TEXT DEFAULT 'Activo',
      empresa_id      TEXT,
      subcategoria    TEXT DEFAULT '',
      bodega          TEXT DEFAULT '',
      codigo_barras   TEXT DEFAULT '',
      metodo_seguridad TEXT DEFAULT 'automatico',
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

  await sql`
    CREATE TABLE IF NOT EXISTS empresas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      nit TEXT,
      correo TEXT,
      ciudad TEXT,
      plan TEXT DEFAULT 'FREE',
      estado TEXT DEFAULT 'ACTIVO',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS proveedores (
      id TEXT PRIMARY KEY,
      nombre TEXT,
      nit TEXT,
      contacto TEXT,
      telefono TEXT,
      correo TEXT,
      direccion TEXT,
      ciudad TEXT,
      pais TEXT DEFAULT 'Colombia',
      estado TEXT DEFAULT 'ACTIVO',
      empresa_id TEXT,
      notas TEXT,
      categoria TEXT,
      lead_time_dias INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;

  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nombre TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nit TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS correo TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ciudad TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'FREE'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ACTIVO'`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;

  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS stock_reservado NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS stock_seguridad NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS punto_reorden NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS consumo_diario NUMERIC(14,4) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS lead_time NUMERIC(8,0) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS dias_cobertura NUMERIC(8,0) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS precio NUMERIC(14,2) DEFAULT 0`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activo'`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS empresa_id TEXT`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS subcategoria TEXT DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS bodega TEXT DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS codigo_barras TEXT DEFAULT ''`;
  await sql`ALTER TABLE articulos ADD COLUMN IF NOT EXISTS metodo_seguridad TEXT DEFAULT 'automatico'`;

  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area TEXT`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT DEFAULT 'CONSULTA'`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id UUID DEFAULT gen_random_uuid()`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'ACTIVO'`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`;

  // Admin user — password: Admin123! → hash: erp_1d6a1e67_8
  await sql`
    INSERT INTO usuarios (nombre, username, password_hash, rol, rol_id)
    SELECT 'Administrador Sistema', 'admin', 'erp_92c82d65_9', 'ADMINISTRADOR',
           COALESCE((SELECT rol_id FROM usuarios WHERE rol_id IS NOT NULL LIMIT 1), gen_random_uuid())
    WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE username = 'admin')`;
  await sql`
    UPDATE usuarios
    SET password_hash = 'erp_92c82d65_9', rol = 'ADMINISTRADOR', estado = 'ACTIVO', updated_at = NOW()
    WHERE username = 'admin'`;
  await sql`
    INSERT INTO empresas (id, nombre, nit, correo, ciudad, plan, estado)
    SELECT '00000000-0000-4000-8000-000000000001'::uuid, 'Empresa Principal', 'N/A', null, null, 'WMS', 'ACTIVO'
    WHERE NOT EXISTS (SELECT 1 FROM empresas)`;

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
      SELECT ${'bod-'+i}, ${'Bodega '+i}, ${'Bodega de almacenamiento '+i}, ${JSON.stringify(pasillos)}
      WHERE NOT EXISTS (SELECT 1 FROM ubicaciones WHERE id = ${'bod-'+i})`;
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

module.exports = { getSQL, setupTables, cors };
