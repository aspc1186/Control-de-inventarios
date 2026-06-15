// api/usuarios/index.js — GET all users + POST create/update
const { getSQL, cors } = require('../_db');

function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  return 'erp_' + h.toString(16).padStart(8,'0') + '_' + str.length;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const sql = getSQL();

  // Ensure columns exist
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono  TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo     TEXT`.catch(()=>{});
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area      TEXT`.catch(()=>{});

  // GET — list all users (without password_hash)
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, nombre, username, correo, rol, cargo, area,
               documento, telefono, estado, created_at, updated_at
        FROM usuarios
        ORDER BY nombre`;
      return res.json({ data: rows, total: rows.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create or update user
  if (req.method === 'POST') {
    const { username, password, nombre, correo, rol, cargo, area, documento, telefono, estado } = req.body || {};
    if (!username || !nombre) return res.status(400).json({ error: 'username y nombre requeridos' });

    try {
      const hash = password ? simpleHash(password) : null;

      if (hash) {
        // Create or update with new password
        await sql`
          INSERT INTO usuarios (nombre, username, correo, password_hash, rol, cargo, area, documento, telefono, estado)
          VALUES (${nombre}, ${username.toLowerCase()}, ${correo||null}, ${hash}, ${rol||'CONSULTA'},
                  ${cargo||null}, ${area||null}, ${documento||null}, ${telefono||null}, ${estado||'ACTIVO'})
          ON CONFLICT (username) DO UPDATE SET
            nombre=EXCLUDED.nombre, correo=EXCLUDED.correo, password_hash=EXCLUDED.password_hash,
            rol=EXCLUDED.rol, cargo=EXCLUDED.cargo, area=EXCLUDED.area,
            estado=EXCLUDED.estado, updated_at=NOW()`;
      } else {
        // Update without changing password
        await sql`
          INSERT INTO usuarios (nombre, username, correo, password_hash, rol, cargo, area, documento, telefono, estado)
          VALUES (${nombre}, ${username.toLowerCase()}, ${correo||null}, 'PENDING', ${rol||'CONSULTA'},
                  ${cargo||null}, ${area||null}, ${documento||null}, ${telefono||null}, ${estado||'ACTIVO'})
          ON CONFLICT (username) DO UPDATE SET
            nombre=EXCLUDED.nombre, correo=EXCLUDED.correo,
            rol=EXCLUDED.rol, cargo=EXCLUDED.cargo, area=EXCLUDED.area,
            estado=EXCLUDED.estado, updated_at=NOW()`;
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
