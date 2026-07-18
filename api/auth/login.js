// api/auth/login.js — Login + Register against Neon usuarios table
const { getSQL, cors } = require('../_db');

// djb2 hash — same as frontend simpleHash()
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
  return 'erp_' + (h >>> 0).toString(16).padStart(8,'0') + '_' + str.length;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const sql  = getSQL();
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id TEXT`.catch(()=>{});

  // ── REGISTER new user ─────────────────────────────────────────────────
  if (body.action === 'register') {
    const { username, password, nombre, correo, rol, cargo, area, documento, telefono } = body;
    if (!username || !password || !nombre) {
      return res.status(400).json({ error: 'username, password y nombre son requeridos' });
    }
    try {
      // Ensure table has needed columns
      await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento TEXT`.catch(()=>{});
      await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono  TEXT`.catch(()=>{});
      await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo     TEXT`.catch(()=>{});
      await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area      TEXT`.catch(()=>{});
      await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id TEXT`.catch(()=>{});

      const hash = simpleHash(password);
      await sql`
        INSERT INTO usuarios (nombre, username, correo, password_hash, rol, cargo, area, documento, telefono, estado)
        VALUES (
          ${nombre}, ${username.toLowerCase()}, ${correo||null}, ${hash},
          ${rol||'CONSULTA'}, ${cargo||null}, ${area||null},
          ${documento||null}, ${telefono||null}, 'ACTIVO'
        )
        ON CONFLICT (username) DO UPDATE SET
          nombre        = EXCLUDED.nombre,
          correo        = EXCLUDED.correo,
          password_hash = EXCLUDED.password_hash,
          rol           = EXCLUDED.rol,
          cargo         = EXCLUDED.cargo,
          area          = EXCLUDED.area,
          updated_at    = NOW()`;

      return res.json({ ok: true, message: 'Usuario registrado en Neon' });
    } catch (err) {
      console.error('[register]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────
  const { login, password } = body;
  if (!login || !password) {
    return res.status(400).json({ error: 'login y password son requeridos' });
  }

  try {
    const rows = await sql`
      SELECT id, nombre, username, correo, rol, cargo, area, estado, empresa_id, password_hash
      FROM usuarios
      WHERE (username = ${login.toLowerCase()} OR correo = ${login.toLowerCase()})
      LIMIT 1`;

    if (!rows[0]) {
      return res.status(401).json({ ok: false, error: 'Usuario no encontrado: ' + login });
    }

    const user = rows[0];

    if (user.estado === 'INACTIVO') {
      return res.status(401).json({ ok: false, error: 'Cuenta inactiva. Contacta al administrador.' });
    }
    if (user.estado === 'BLOQUEADO') {
      return res.status(401).json({ ok: false, error: 'Cuenta bloqueada. Contacta al administrador.' });
    }

    const hash = simpleHash(password);
    if (hash !== user.password_hash) {
      return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
    }

    return res.json({
      ok: true,
      user: {
        id:       user.id,
        nombre:   user.nombre,
        username: user.username,
        correo:   user.correo,
        rol:      user.rol,
        cargo:    user.cargo,
        area:     user.area,
        estado:   user.estado,
        empresa_id:user.empresa_id,
      }
    });

  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ error: 'Error del servidor: ' + err.message });
  }
};
