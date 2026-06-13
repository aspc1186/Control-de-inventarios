// api/setup.js — Run once: /api/setup?secret=setup123
const { getSQL, setupTables, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = process.env.SETUP_SECRET || 'setup123';
  if (req.query.secret !== secret) {
    return res.status(403).json({ error: 'Unauthorized. Add ?secret=setup123' });
  }

  try {
    const sql = getSQL();
    await setupTables(sql);
    res.json({ ok: true, message: 'Tablas creadas. Admin: admin / Admin123!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
