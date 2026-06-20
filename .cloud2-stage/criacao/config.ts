/** Configuração do módulo Criação no cloud2 (portal-ibiza). */
export const criacaoConfig = {
  ingestSecret: process.env.CRIACAO_INGEST_SECRET ?? process.env.CLOUD2_INGEST_SECRET ?? '',
  /** Raiz NVMe/local: upload scratch + versões de uso (quente). */
  storageRoot: process.env.CRIACAO_STORAGE_ROOT ?? '/var/lib/portal-ibiza/criacao',
  /** Alvo EBU-style para loudnorm (integrado). */
  targetLufs: Number(process.env.CRIACAO_TARGET_LUFS ?? '-14'),
  targetTruePeak: Number(process.env.CRIACAO_TARGET_TP ?? '-1.0'),
  targetLra: Number(process.env.CRIACAO_TARGET_LRA ?? '11'),
  /** Ponto de mix padrão até Essentia entrar. */
  defaultMixSegundos: Number(process.env.CRIACAO_DEFAULT_MIX_SEG ?? '4'),
  workerPollMs: Number(process.env.CRIACAO_WORKER_POLL_MS ?? '2000'),
  b2: {
    endpoint: process.env.B2_ENDPOINT ?? process.env.B2_S3_ENDPOINT ?? '',
    region: process.env.B2_REGION ?? 'us-west-002',
    bucket: process.env.B2_BUCKET ?? '',
    accessKeyId: process.env.B2_KEY_ID ?? process.env.B2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.B2_APPLICATION_KEY ?? process.env.B2_SECRET_ACCESS_KEY ?? '',
    prefix: process.env.B2_MASTER_PREFIX ?? 'masters/',
  },
};

export function b2Enabled(): boolean {
  const b = criacaoConfig.b2;
  return Boolean(b.endpoint && b.bucket && b.accessKeyId && b.secretAccessKey);
}
