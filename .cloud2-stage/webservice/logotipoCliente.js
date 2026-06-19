import { getPool } from '../../db/pool.js';
import { loadSessionByToken } from '../loginByToken.js';

/** GET /api/logotipo_cliente/?token= — JPEG binário do cliente (contrato legado). */
export async function registerLogotipoClienteRoutes(app, prefix) {
  app.get(`${prefix}/logotipo_cliente/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) {
      return reply.code(404).send('');
    }

    const session = await loadSessionByToken(token);
    if (!session || session.pdv_status === 'I') {
      return reply.code(404).send('');
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT logotipo_jpeg FROM clientes WHERE id = $1 LIMIT 1`,
      [session.cliente_id],
    );
    const buf = rows[0]?.logotipo_jpeg;
    if (!buf || (Buffer.isBuffer(buf) && buf.length === 0)) {
      return reply.code(404).send('');
    }

    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(buf);
  });
}
