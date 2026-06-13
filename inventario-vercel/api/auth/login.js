// api/auth/login.js
const { getSQL, cors } = require('../_db');

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  return 'erp_' + h.toString(16).padStart(8,'0') + '_' + str.length;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Login y contraseña requeridos' });

  try {
    const sql = getSQL();
    const rows = await sql`
      SELECT * FROM usuarios
      WHERE (username = ${login.toLowerCase()} OR correo = ${login.toLowerCase()})
        AND estado = 'ACTIVO'
      LIMIT 1`;

    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    if (hash(password) !== user.password_hash) return res.status(401).json({ error: 'Contraseña incorrecta' });

    res.json({
      ok: true,
      user: { id: user.id, nombre: user.nombre, username: user.username,
              correo: user.correo, rol: user.rol, cargo: user.cargo, area: user.area }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
