// api/ubicaciones/index.js
const { sql, cors } = require('../_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { rows } = await sql`SELECT * FROM ubicaciones ORDER BY nombre`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { nombre, descripcion, pasillos } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await sql`
      INSERT INTO ubicaciones (nombre, descripcion, pasillos)
      VALUES (${nombre}, ${descripcion || null}, ${JSON.stringify(pasillos || [])})
      RETURNING *`;
    return res.status(201).json(rows[0]);
  }

  res.status(405).end();
};
