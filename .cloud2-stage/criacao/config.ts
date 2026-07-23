/** Configuração do módulo Criação no cloud2 (portal-ibiza). */
export const criacaoConfig = {
  ingestSecret: process.env.CRIACAO_INGEST_SECRET ?? process.env.CLOUD2_INGEST_SECRET ?? '',
  /** Raiz NVMe/local: upload scratch + versões de uso (quente). */
  storageRoot:
    process.env.CRIACAO_STORAGE_ROOT ??
    process.env.CRIACAO_DATA_DIR ??
    '/var/lib/portal-ibiza/criacao',
  /** Alvo EBU-style para loudnorm (integrado). */
  targetLufs: Number(process.env.CRIACAO_TARGET_LUFS ?? '-14'),
  targetTruePeak: Number(process.env.CRIACAO_TARGET_TP ?? '-1.0'),
  targetLra: Number(process.env.CRIACAO_TARGET_LRA ?? '11'),
  /** Legado — publicação usa mix detectado; 0 se ausente. */
  defaultMixSegundos: Number(process.env.CRIACAO_DEFAULT_MIX_SEG ?? '0'),
  workerPollMs: Number(process.env.CRIACAO_WORKER_POLL_MS ?? '2000'),
  /** Mantém upload/work em erro por N horas antes do GC (retentativa manual). */
  scratchRetentionErroHours: Number(process.env.CRIACAO_SCRATCH_RETENTION_ERRO_HOURS ?? '48'),
  /** Arquivos/pastas em pastas temp com mtime mais antigo que N dias → alerta «limbo» no /ops/orphans. */
  tempLimboDays: Number(process.env.CRIACAO_TEMP_LIMBO_DAYS ?? '7'),
  storageGcIntervalMs: Number(process.env.CRIACAO_STORAGE_GC_INTERVAL_MS ?? '300000'),
  maxUploadBytes: Number(process.env.CRIACAO_MAX_UPLOAD_BYTES ?? String(100 * 1024 * 1024)),
  /** AES-256-GCM para .rib (mín. 16 chars). Vazio = grava MP3 plano em uso/. */
  ribSecret: process.env.CRIACAO_RIB_SECRET ?? process.env.CRIACAO_INGEST_SECRET ?? '',
  b2: {
    endpoint: process.env.B2_ENDPOINT ?? process.env.B2_S3_ENDPOINT ?? '',
    region: process.env.B2_REGION ?? 'us-west-002',
    bucket: process.env.B2_BUCKET ?? '',
    accessKeyId: process.env.B2_KEY_ID ?? process.env.B2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.B2_APPLICATION_KEY ?? process.env.B2_SECRET_ACCESS_KEY ?? '',
    prefix: process.env.B2_MASTER_PREFIX ?? 'masters/',
    /** 128 mono / .rib — prefixo no mesmo bucket B2 (ex. uso/). */
    usoPrefix: process.env.B2_USO_PREFIX ?? 'uso/',
  },
  /** R2 quente — backup opcional das versões .rib (Cloudflare). */
  r2: {
    endpoint: process.env.R2_ENDPOINT ?? '',
    region: process.env.R2_REGION ?? 'auto',
    bucket: process.env.R2_BUCKET ?? '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    prefix: process.env.R2_USO_PREFIX ?? 'uso/',
  },
};

export function b2Enabled(): boolean {
  const b = criacaoConfig.b2;
  return Boolean(b.endpoint && b.bucket && b.accessKeyId && b.secretAccessKey);
}

/** Variáveis ausentes no processo atual (api vs worker). */
export function b2ConfigDiagnostics(): { ok: boolean; missingEnv: string[] } {
  const b = criacaoConfig.b2;
  const missingEnv: string[] = [];
  if (!b.endpoint) missingEnv.push('B2_ENDPOINT ou B2_S3_ENDPOINT');
  if (!b.bucket) missingEnv.push('B2_BUCKET');
  if (!b.accessKeyId) missingEnv.push('B2_KEY_ID ou B2_ACCESS_KEY_ID');
  if (!b.secretAccessKey) missingEnv.push('B2_APPLICATION_KEY ou B2_SECRET_ACCESS_KEY');
  return { ok: missingEnv.length === 0, missingEnv };
}

export function r2Enabled(): boolean {
  const r = criacaoConfig.r2;
  return Boolean(r.endpoint && r.bucket && r.accessKeyId && r.secretAccessKey);
}

/** Grava versão 128 no B2 após pipeline (requer B2_*). Produção baseline: desligado até homolog — CRIACAO_USO_B2=1 */
export function usoB2Enabled(): boolean {
  if (!b2Enabled()) return false;
  const v = (process.env.CRIACAO_USO_B2 ?? '0').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Espelha 128 no disco cloud2 (preview legado /criacao/audio). Desligar: CRIACAO_USO_DISK_MIRROR=0 */
export function usoDiskMirrorEnabled(): boolean {
  const v = (process.env.CRIACAO_USO_DISK_MIRROR ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}
