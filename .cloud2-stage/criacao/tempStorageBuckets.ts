/**
 * Pastas temporárias do pipeline Criação (cloud2).
 * Cada etapa grava só na sua pasta; ao concluir, `storageCleanup` remove o scratch.
 * Pastas fora desta lista (uso/, master-local/, vinheta/) são armazenamento canônico — não são temp.
 */
export type TempStorageBucketDef = {
  /** Nome curto para ops/logs */
  id: 'upload' | 'download-staging' | 'work';
  /** Subpasta sob CRIACAO_STORAGE_ROOT */
  subdir: string;
  /** Entrada = arquivo .mp3 ou subpasta (work/) */
  entryKind: 'file' | 'directory';
  /** Processo / origem */
  processo: string;
  /** Quando o scratch é removido em fluxo normal */
  cleanupWhen: string;
  /** Tabela Neon principal para cruzar órfãos */
  neonTable: string;
};

export const TEMP_STORAGE_BUCKETS: TempStorageBucketDef[] = [
  {
    id: 'upload',
    subdir: 'upload',
    entryKind: 'file',
    processo: 'Fila upload / ingest (MP3 bruto antes do pipeline)',
    cleanupWhen: 'Item concluído, erro após retention, ou duplicata descartada (`cleanupAfterItemPersisted`)',
    neonTable: 'processamento_item.raw_storage_key',
  },
  {
    id: 'download-staging',
    subdir: 'download-staging',
    entryKind: 'file',
    processo: 'Deemix / Spotizerr / YouTube antes do import',
    cleanupWhen: 'Após ingest-from-staging → upload, ou GC de download não importado',
    neonTable: 'download_item.storage_key',
  },
  {
    id: 'work',
    subdir: 'work',
    entryKind: 'directory',
    processo: 'FFmpeg / Essentia / mix (intermediários por itemId)',
    cleanupWhen: 'Fim do item (`cleanupProcessamentoItemScratch`) ou GC se não está processando',
    neonTable: 'processamento_item (status processando)',
  },
];

export function defaultTempLimboDays(): number {
  const n = Number(process.env.CRIACAO_TEMP_LIMBO_DAYS ?? '7');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 7;
}
