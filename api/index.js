// api/index.js - API landing endpoint
const { cors } = require('./_db');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  return res.status(200).json({
    ok: true,
    name: 'StockFlow API',
    endpoints: [
      '/api/health',
      '/api/setup',
      '/api/articulos',
      '/api/empresas',
      '/api/movimientos',
      '/api/movimientos?recurso=compras',
      '/api/movimientos?recurso=traslados',
      '/api/movimientos?recurso=picking',
      '/api/movimientos?recurso=packing',
      '/api/movimientos?recurso=guias',
      '/api/movimientos?recurso=despachos',
      '/api/movimientos?recurso=auditoria',
      '/api/movimientos?recurso=seguridad',
      '/api/proveedores',
      '/api/ubicaciones',
      '/api/ciclicos',
      '/api/usuarios',
      '/api/auth/login',
      '/api/auditoria-tecnica'
    ]
  });
};
