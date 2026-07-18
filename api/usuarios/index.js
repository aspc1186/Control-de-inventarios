// api/usuarios/index.js — GET all users + POST create/update
const { getSQL, cors } = require('../_db');
const { randomUUID } = require('crypto');

function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
  return 'erp_' + (h >>> 0).toString(16).padStart(8,'0') + '_' + str.length;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  // Ensure columns exist
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono  TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo     TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area      TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos INTEGER DEFAULT 0`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS primer_ingreso BOOLEAN DEFAULT FALSE`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_pwd BOOLEAN DEFAULT FALSE`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pwd_temporal BOOLEAN DEFAULT FALSE`.catch(()=>{});
  await sql`
    UPDATE usuarios
    SET rol = 'SUPER ADMINISTRADOR', estado = 'ACTIVO', empresa_id = NULL, updated_at = NOW()
    WHERE username IN ('superadmin', 'superadministrador')`.catch(()=>{});

  // GET — list all users (without password_hash)
  if (req.method === 'GET') {
    try {
      const { empresa_id } = req.query;
      const rows = empresa_id && empresa_id !== '__SA__'
        ? await sql`
          SELECT id, nombre, username, correo, rol, cargo, area, documento, telefono,
                 estado, empresa_id, intentos, primer_ingreso, debe_cambiar_pwd, pwd_temporal,
                 created_at, updated_at
          FROM usuarios
          WHERE empresa_id = ${empresa_id}
          ORDER BY nombre`
        : await sql`
          SELECT id, nombre, username, correo, rol, cargo, area, documento, telefono,
                 estado, empresa_id, intentos, primer_ingreso, debe_cambiar_pwd, pwd_temporal,
                 created_at, updated_at
          FROM usuarios
          ORDER BY nombre`;
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create or update user
  if (req.method === 'POST' || req.method === 'PUT') {
    const {
      id, username, password, password_hash, nombre, correo, rol, cargo, area,
      documento, telefono, estado, empresa_id, intentos, primer_ingreso,
      debe_cambiar_pwd, pwd_temporal
    } = req.body || {};
    if (!username || !nombre) return res.status(400).json({ error: 'username y nombre requeridos' });

    try {
      const normalizedUsername = username.toLowerCase();
      const userId = id || randomUUID();
      const hash = password ? simpleHash(password) : (password_hash || null);

      if (hash) {
        // Create or update with new password
        await sql`
          INSERT INTO usuarios (id, nombre, username, correo, password_hash, rol, cargo, area, documento, telefono,
                                estado, empresa_id, intentos, primer_ingreso, debe_cambiar_pwd, pwd_temporal)
          VALUES (${userId}, ${nombre}, ${normalizedUsername}, ${correo||null}, ${hash}, ${rol||'CONSULTA'},
                  ${cargo||null}, ${area||null}, ${documento||null}, ${telefono||null}, ${estado||'ACTIVO'},
                  ${empresa_id||null}, ${Number(intentos||0)}, ${!!primer_ingreso}, ${!!debe_cambiar_pwd}, ${!!pwd_temporal})
          ON CONFLICT (username) DO UPDATE SET
            nombre=EXCLUDED.nombre, correo=EXCLUDED.correo, password_hash=EXCLUDED.password_hash,
            rol=EXCLUDED.rol, cargo=EXCLUDED.cargo, area=EXCLUDED.area,
            documento=EXCLUDED.documento, telefono=EXCLUDED.telefono, estado=EXCLUDED.estado,
            empresa_id=EXCLUDED.empresa_id, intentos=EXCLUDED.intentos,
            primer_ingreso=EXCLUDED.primer_ingreso, debe_cambiar_pwd=EXCLUDED.debe_cambiar_pwd,
            pwd_temporal=EXCLUDED.pwd_temporal, updated_at=NOW()`;
      } else {
        // Update without changing password
        await sql`
          INSERT INTO usuarios (id, nombre, username, correo, password_hash, rol, cargo, area, documento, telefono,
                                estado, empresa_id, intentos, primer_ingreso, debe_cambiar_pwd, pwd_temporal)
          VALUES (${userId}, ${nombre}, ${normalizedUsername}, ${correo||null}, 'PENDING', ${rol||'CONSULTA'},
                  ${cargo||null}, ${area||null}, ${documento||null}, ${telefono||null}, ${estado||'ACTIVO'},
                  ${empresa_id||null}, ${Number(intentos||0)}, ${!!primer_ingreso}, ${!!debe_cambiar_pwd}, ${!!pwd_temporal})
          ON CONFLICT (username) DO UPDATE SET
            nombre=EXCLUDED.nombre, correo=EXCLUDED.correo,
            rol=EXCLUDED.rol, cargo=EXCLUDED.cargo, area=EXCLUDED.area,
            documento=EXCLUDED.documento, telefono=EXCLUDED.telefono, estado=EXCLUDED.estado,
            empresa_id=EXCLUDED.empresa_id, intentos=EXCLUDED.intentos,
            primer_ingreso=EXCLUDED.primer_ingreso, debe_cambiar_pwd=EXCLUDED.debe_cambiar_pwd,
            pwd_temporal=EXCLUDED.pwd_temporal, updated_at=NOW()`;
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { username } = req.query;
    if (!username || username === 'admin') return res.status(400).json({ error: 'No se puede eliminar este usuario' });
    try {
      await sql`DELETE FROM usuarios WHERE username = ${username.toLowerCase()} AND username != 'admin'`;
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
};
