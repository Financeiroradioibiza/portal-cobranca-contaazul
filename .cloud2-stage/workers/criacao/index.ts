import 'dotenv/config';
import { runPipelineLoop } from '../../criacao/pipeline.js';
import { enrichLabelsForMusica } from './tags.js';
import { portalQuery } from '../../criacao/portalDb.js';

/**
 * Worker de produção musical — LUFS, transcode 128 mono, master B2, musica_versao.
 * PM2: `node dist/workers/criacao/index.js`
 */
async function enrichRecentLabels(): Promise<void> {
  try {
    const r = await portalQuery<{ id: string }>(
      `SELECT id FROM musica_biblioteca
        WHERE status = 'pronta'
        ORDER BY updated_at DESC
        LIMIT 3`,
    );
    for (const row of r.rows) {
      enrichLabelsForMusica(row.id).catch(() => {});
    }
  } catch {
    /* Neon indisponível momentâneo */
  }
}

async function main(): Promise<void> {
  setInterval(() => void enrichRecentLabels(), 60_000);
  await runPipelineLoop();
}

main().catch((err) => {
  console.error('[criacao-worker] falhou:', err);
  process.exit(1);
});
