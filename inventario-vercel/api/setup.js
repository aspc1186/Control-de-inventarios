// api/setup.js — call once via /api/setup?secret=SETUP_SECRET
const { setupTables, cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const secret = process.env.SETUP_SECRET || 'setup123';
  if (req.query.secret !== secret) {
    return res.status(403).json({ error: 'Unauthorized. Add ?secret=SETUP_SECRET' });
  }
  
  try {
    await setupTables();
    res.json({ ok: true, message: 'Tables created successfully. Admin: admin / Admin123!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
