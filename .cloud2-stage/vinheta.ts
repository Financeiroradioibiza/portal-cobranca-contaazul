import type { FastifyInstance } from 'fastify';

/** Rotas de vinheta — stub mínimo até upload de spots no cloud2. */
export async function registerVinhetaRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.post(`${prefix}/vinheta-ingest`, async (_req, reply) => {
    return reply.code(501).send({ ok: false, error: 'nao_implementado' });
  });

  app.get(`${prefix}/vinheta-audio/:vinhetaId`, async (_req, reply) => {
    return reply.code(501).send({ ok: false, error: 'nao_implementado' });
  });
}
