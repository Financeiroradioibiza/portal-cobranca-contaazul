import bcrypt from 'bcryptjs';
import { getPool } from '../../db/pool.js';
import { clientIpFromRequest, rateLimitCheck } from './rateLimit.js';

/** POST /api/login/ — contrato CakePHP + Player 5 ({ mensagem: ["valido", cliente_id] }). */
export async function registerLoginRoutes(app, prefix) {
  app.post(`${prefix}/login/`, async (req, reply) => {
    const ip = clientIpFromRequest(req);
    if (!rateLimitCheck(`login:${ip}`, { windowMs: 60_000, max: 20 })) {
      return reply.code(429).send({ mensagem: 'usuario_invalido' });
    }

    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      return reply.send({ mensagem: 'usuario_invalido' });
    }

    const pool = getPool();

    // 1) Tabela legado usuarios (portal-ibiza)
    const usu = await pool.query(
      `SELECT u.cliente_id, u.password_hash, u.status
         FROM usuarios u
        WHERE lower(trim(u.email)) = $1
        LIMIT 1`,
      [email],
    );
    let row = usu.rows[0];
    if (row && row.status === 'A' && row.password_hash) {
      const ok = await bcrypt.compare(password, row.password_hash);
      if (ok) return reply.send({ mensagem: ['valido', String(row.cliente_id)] });
    }

    // 2) Fallback: clientes sincronizados pelo portal (sync-registry)
    const cli = await pool.query(
      `SELECT id AS cliente_id, senha_hash AS password_hash
         FROM clientes
        WHERE lower(trim(email)) = $1 AND senha_hash IS NOT NULL
        LIMIT 1`,
      [email],
    );
    row = cli.rows[0];
    if (row?.password_hash) {
      const ok = await bcrypt.compare(password, row.password_hash);
      if (ok) return reply.send({ mensagem: ['valido', String(row.cliente_id)] });
    }

    return reply.send({ mensagem: 'usuario_invalido' });
  });
}
