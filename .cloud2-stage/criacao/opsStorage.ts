import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statfs } from 'node:fs/promises';
import { b2ConfigDiagnostics, b2Enabled, criacaoConfig, r2Enabled } from './config.js';

export type SystemStats = {
  cpuCount: number;
  load1: number;
  load5: number;
  load15: number;
  /** load1 / cpuCount × 100 — proxy de CPU ocupada (Linux load average). */
  loadPercent: number;
};

export function collectSystemStats(): SystemStats {
  const [load1, load5, load15] = os.loadavg();
  const cpuCount = Math.max(1, os.cpus().length);
  const loadPercent = Math.round((load1 / cpuCount) * 1000) / 10;
  return { cpuCount, load1, load5, load15, loadPercent };
}

const execFileAsync = promisify(execFile);

export type DiskStats = {
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
};

export type DirSize = { name: string; path: string; bytes: number | null };

export type BucketStats = {
  configured: boolean;
  enabled: boolean;
  bucket: string;
  prefix: string;
  objectCount: number;
  totalBytes: number;
  truncated: boolean;
  error: string | null;
  missingEnv?: string[];
};

async function volumeStats(root: string): Promise<DiskStats | null> {
  try {
    const st = await statfs(root);
    const totalBytes = st.blocks * st.bsize;
    const freeBytes = st.bfree * st.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    return { path: root, totalBytes, usedBytes, freeBytes, usedPercent };
  } catch {
    return null;
  }
}

async function dirSizeBytes(dir: string): Promise<number | null> {
  if (!fs.existsSync(dir)) return 0;
  try {
    const { stdout } = await execFileAsync('du', ['-sb', dir], { timeout: 45000 });
    const n = parseInt(String(stdout).split('\t')[0]?.trim() ?? '', 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function s3BucketStats(opts: {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxPages?: number;
}): Promise<Omit<BucketStats, 'configured' | 'enabled'>> {
  const base = {
    bucket: opts.bucket,
    prefix: opts.prefix,
    objectCount: 0,
    totalBytes: 0,
    truncated: false,
    error: null as string | null,
  };
  if (!opts.endpoint || !opts.bucket || !opts.accessKeyId || !opts.secretAccessKey) {
    return { ...base, error: 'credenciais_incompletas' };
  }
  try {
    const mod = await import('@aws-sdk/client-s3');
    const { S3Client, ListObjectsV2Command } = mod;
    const client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
      forcePathStyle: true,
    });
    let token: string | undefined;
    let pages = 0;
    const maxPages = opts.maxPages ?? 40;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: opts.bucket,
          Prefix: opts.prefix || undefined,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const obj of res.Contents ?? []) {
        base.objectCount += 1;
        base.totalBytes += obj.Size ?? 0;
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
      pages += 1;
      if (pages >= maxPages && token) {
        base.truncated = true;
        break;
      }
    } while (token);
    return base;
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : 'erro_s3',
    };
  }
}

export async function collectOpsStorageSnapshot() {
  const root = criacaoConfig.storageRoot;
  const disk = await volumeStats(root);

  const subdirs = ['upload', 'work', 'uso', 'uso/musicas', 'download-staging', 'master-local'];
  const dirs: DirSize[] = [];
  for (const name of subdirs) {
    const p = path.join(root, name);
    dirs.push({ name, path: p, bytes: await dirSizeBytes(p) });
  }

  const r2 = criacaoConfig.r2;
  const r2Stats: BucketStats = {
    configured: Boolean(r2.endpoint && r2.bucket),
    enabled: r2Enabled(),
    ...(await s3BucketStats({
      endpoint: r2.endpoint,
      region: r2.region,
      bucket: r2.bucket,
      prefix: r2.prefix,
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    })),
  };

  const b2 = criacaoConfig.b2;
  const b2Diag = b2ConfigDiagnostics();
  const b2Listed = await s3BucketStats({
    endpoint: b2.endpoint,
    region: b2.region,
    bucket: b2.bucket,
    prefix: b2.prefix,
    accessKeyId: b2.accessKeyId,
    secretAccessKey: b2.secretAccessKey,
    maxPages: 20,
  });
  const b2Stats: BucketStats = {
    configured: b2Diag.ok,
    enabled: b2Enabled(),
    missingEnv: b2Diag.missingEnv,
    ...b2Listed,
    bucket: b2.bucket,
    prefix: b2.prefix,
  };

  const b2UsoListed = await s3BucketStats({
    endpoint: b2.endpoint,
    region: b2.region,
    bucket: b2.bucket,
    prefix: b2.usoPrefix,
    accessKeyId: b2.accessKeyId,
    secretAccessKey: b2.secretAccessKey,
    maxPages: 20,
  });
  const b2UsoStats: BucketStats = {
    configured: b2Diag.ok,
    enabled: b2Enabled(),
    missingEnv: b2Diag.missingEnv,
    ...b2UsoListed,
    bucket: b2.bucket,
    prefix: b2.usoPrefix,
  };

  return {
    ok: true,
    collectedAt: new Date().toISOString(),
    storageRoot: root,
    disk,
    system: collectSystemStats(),
    dirs,
    r2: r2Stats,
    b2: b2Stats,
    b2Uso: b2UsoStats,
    providers: {
      deemix: Boolean(process.env.CRIACAO_DEEMIX_ARL),
      spotizerr: Boolean(process.env.CRIACAO_SPOTIZERR_URL),
      youtube: Boolean(process.env.CRIACAO_YOUTUBE_DL_URL),
    },
  };
}
