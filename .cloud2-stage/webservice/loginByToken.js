import { loadSessionByToken, sessionArrayFromRow } from '../loginByToken.js';

export { loadSessionByToken, sessionArrayFromRow };

/** GET /api/loginByToken/ — compatível com Player 4/5 legado. */
export async function registerLoginByTokenRoutes(app, prefix) {
  app.get(`${prefix}/loginByToken/`, async (req, reply) => {
    const token = String(req.query?.token ?? '').trim();
    if (!token) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    const row = await loadSessionByToken(token);
    if (!row) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    if (row.data_fim && new Date(row.data_fim).getTime() < Date.now()) {
      return reply.send({ mensagem: 'token_invalido' });
    }

    return reply.send(sessionArrayFromRow(row));
  });
}
