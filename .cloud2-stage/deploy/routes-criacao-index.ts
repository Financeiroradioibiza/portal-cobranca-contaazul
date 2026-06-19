import type { FastifyInstance } from "fastify";
import { registerIngestRoutes } from "./ingest.js";
import { registerAudioRoutes } from "./audio.js";
import { registerVinhetaRoutes } from "./vinheta.js";
import { registerPublicarRoutes } from "./publicar.js";
import { registerEnriquecerTagsRoutes } from "./enriquecer-tags.js";
import { registerPlayerRegistryRoutes } from "./player-registry.js";
import { registerApagarMusicaRoutes } from "./apagar-musica.js";

const CRIACAO_PREFIX = "/criacao";

/** Rotas do módulo Criação servidas pelo cloud2 (binários NÃO passam pelo Netlify). */
export async function registerCriacaoRoutes(app: FastifyInstance): Promise<void> {
  await registerIngestRoutes(app, CRIACAO_PREFIX);
  await registerAudioRoutes(app, CRIACAO_PREFIX);
  await registerVinhetaRoutes(app, CRIACAO_PREFIX);
  await registerPublicarRoutes(app, CRIACAO_PREFIX);
  await registerEnriquecerTagsRoutes(app, CRIACAO_PREFIX);
  await registerApagarMusicaRoutes(app, CRIACAO_PREFIX);
  await registerPlayerRegistryRoutes(app, CRIACAO_PREFIX);
}
