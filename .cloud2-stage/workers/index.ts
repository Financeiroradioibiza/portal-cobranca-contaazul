import 'dotenv/config';
import { Worker } from 'bullmq';
import { config } from '../config.js';

function redisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || '6379'),
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

const connection = redisConnectionFromUrl(config.redisUrl);

function startWorker(
  name: string,
  handler: (job: { id?: string; name: string; data: unknown }) => Promise<void>,
): Worker {
  const worker = new Worker(
    name,
    async (job) => {
      console.log(`[worker:${name}] job ${job.id} — ${job.name}`);
      await handler(job);
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    console.error(`[worker:${name}] job ${job?.id} falhou:`, err.message);
  });
  return worker;
}

/** BullMQ stub — pipeline Criação roda em `workers/criacao/index.ts` (worker-audio). */
async function main(): Promise<void> {
  console.log('[worker] portal-ibiza filas BullMQ (stub)');
  console.log('[worker] filas:', Object.values(config.queues).join(', '));

  const workers = [
    startWorker(config.queues.audioIngest, async () => {}),
    startWorker(config.queues.audioTranscode, async () => {}),
    startWorker(config.queues.audioPack, async () => {}),
  ];

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
  };

  process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
}

main().catch((err) => {
  console.error('[worker] falhou:', err);
  process.exit(1);
});
