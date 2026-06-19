import type { FastifyInstance } from 'fastify';
import { registerLoginRoutes } from './webservice/login.js';
import { registerGetPdvsRoutes } from './webservice/getPdvs.js';
import { registerLoginByTokenRoutes } from './webservice/loginByToken.js';
import { registerPingRoutes } from './webservice/ping.js';
import { registerPlaylistRoutes } from './webservice/playlist.js';
import { registerGetMusicaRoutes } from './webservice/getMusica.js';
import { registerAgendasRoutes } from './webservice/agendas.js';
import { registerVinhetasProgramadasRoutes } from './webservice/vinhetasProgramadas.js';
import { registerVinhetasAgendadasRoutes } from './webservice/vinhetasAgendadas.js';
import { registerUpdatePdvInstaladoRoutes, registerStubRoutes } from './webservice/stubs.js';
import { registerSaveAtualizadasRoutes } from './webservice/saveAtualizadas.js';
import { registerPlayerAvisosRoutes } from './webservice/playerAvisos.js';
import { registerLogotipoClienteRoutes } from './webservice/logotipoCliente.js';
import { registerSetAgendaAtualizadaRoutes } from './webservice/setAgendaAtualizada.js';

const WS_PREFIX = '/api';

/** Rotas compatíveis com PROTOCOLO_WEBSERVICE.md (Player 4.0/5). */
export async function registerWebserviceRoutes(app: FastifyInstance): Promise<void> {
  await registerLoginRoutes(app, WS_PREFIX);
  await registerGetPdvsRoutes(app, WS_PREFIX);
  await registerLoginByTokenRoutes(app, WS_PREFIX);
  await registerPingRoutes(app, WS_PREFIX);
  await registerPlaylistRoutes(app, WS_PREFIX);
  await registerAgendasRoutes(app, WS_PREFIX);
  await registerVinhetasProgramadasRoutes(app, WS_PREFIX);
  await registerVinhetasAgendadasRoutes(app, WS_PREFIX);
  await registerGetMusicaRoutes(app, WS_PREFIX);
  await registerUpdatePdvInstaladoRoutes(app, WS_PREFIX);
  await registerStubRoutes(app, WS_PREFIX);
  await registerSaveAtualizadasRoutes(app, WS_PREFIX);
  await registerPlayerAvisosRoutes(app, WS_PREFIX);
  await registerLogotipoClienteRoutes(app, WS_PREFIX);
  await registerSetAgendaAtualizadaRoutes(app, WS_PREFIX);
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, service: 'portal-ibiza-api' }));
}
