import fsp from 'node:fs/promises';
import path from 'node:path';
import { portalQuery } from './portalDb.js';
import {
  downloadStagingKey,
  downloadStagingPath,
  ensureStorageDirs,
} from './storage.js';

type PendingItem = {
  id: string;
  job_id: string;
  provider: string;
  linha_original: string;
  input_tipo: string;
};

type DownloadEnv = {
  spotizerrUrl: string;
  spotizerrToken: string;
  deemixUrl: string;
  deemixArl: string;
  deemixMusicUrl: string;
  deemixFilesDir: string;
  youtubeDlUrl: string;
  youtubeDlApiKey: string;
};

type DeemixFileEntry = string | { filename?: string; path?: string };

type DeemixQueueItem = {
  uuid?: string;
  downloaded?: number;
  errors?: number;
  files?: DeemixFileEntry[];
  title?: string;
  artist?: string;
};

const DEEMIX_BITRATE = Number(process.env.CRIACAO_DEEMIX_BITRATE ?? '1') || 1;
const DEEMIX_POLL_MS = 3000;
const DEEMIX_POLL_TIMEOUT_MS = 15 * 60 * 1000;

function env(): DownloadEnv {
  const deemixUrl = (process.env.CRIACAO_DEEMIX_URL ?? '').replace(/\/$/, '');
  let deemixMusicUrl = (process.env.CRIACAO_DEEMIX_MUSIC_URL ?? '').replace(/\/$/, '');
  if (!deemixMusicUrl && deemixUrl) {
    try {
      const u = new URL(deemixUrl);
      u.port = '6596';
      deemixMusicUrl = u.origin;
    } catch {
      /* ignore */
    }
  }
  return {
    spotizerrUrl: (process.env.CRIACAO_SPOTIZERR_URL ?? '').replace(/\/$/, ''),
    spotizerrToken: process.env.CRIACAO_SPOTIZERR_TOKEN ?? '',
    deemixUrl,
    deemixArl: (process.env.CRIACAO_DEEMIX_ARL ?? '').replace(/\s+/g, ''),
    deemixMusicUrl,
    deemixFilesDir: (process.env.CRIACAO_DEEMIX_FILES_DIR ?? '').replace(/\/$/, ''),
    youtubeDlUrl: (process.env.CRIACAO_YOUTUBE_DL_URL ?? '').replace(/\/$/, ''),
    youtubeDlApiKey: process.env.CRIACAO_YOUTUBE_DL_API_KEY ?? '',
  };
}

function deemixCookieHeader(res: Response): string {
  const parts = res.headers.getSetCookie?.() ?? [];
  if (parts.length > 0) {
    return parts.map((c) => c.split(';')[0]!.trim()).filter(Boolean).join('; ');
  }
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw
    .split(/,(?=[^;]+=)/)
    .map((c) => c.split(';')[0]!.trim())
    .filter(Boolean)
    .join('; ');
}

async function deemixFetch(
  baseUrl: string,
  apiPath: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  return fetch(`${baseUrl}/api${apiPath}`, { ...init, headers });
}

async function deemixEnsureSession(cfg: DownloadEnv): Promise<string> {
  if (!cfg.deemixArl) {
    throw new Error('CRIACAO_DEEMIX_ARL não configurado no cloud2 (mesmo ARL da UI do Deemix)');
  }
  const res = await deemixFetch(cfg.deemixUrl, '/loginArl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arl: cfg.deemixArl }),
  });
  const cookie = deemixCookieHeader(res);
  const data = (await res.json()) as { status?: number; error?: string };
  if (!res.ok || data.status === 0 || data.status === -1) {
    throw new Error(
      data.error === 'invalidArl' ?
        'Deemix rejeitou o ARL — cole só o valor hex do cookie deezer.com'
      : 'Deemix loginArl falhou — verifique CRIACAO_DEEMIX_ARL no cloud2',
    );
  }
  return cookie;
}

function normalizeDeemixSearchLine(line: string): string {
  let s = line.trim();
  s = s.replace(/\.(mp3|flac|m4a|wav)$/i, '');
  s = s.replace(/~\d+$/i, '');
  s = s.replace(/\s*\(\d+\)\s*$/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function deemixSearchQueries(line: string): string[] {
  const base = normalizeDeemixSearchLine(line);
  const out: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (t && !out.includes(t)) out.push(t);
  };

  push(base);
  const dash = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dash) {
    const artist = dash[1]!.trim();
    const title = dash[2]!.trim();
    push(title);
    push(`${artist} ${title}`);
    push(`${title} ${artist}`);
    push(title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}

async function deemixResolveTrackUrl(cfg: DownloadEnv, line: string, cookie: string): Promise<string> {
  if (/^https?:\/\/(?:www\.)?deezer\.com\//i.test(line)) return line.trim();

  for (const query of deemixSearchQueries(line)) {
    const res = await deemixFetch(
      cfg.deemixUrl,
      `/search?term=${encodeURIComponent(query)}&type=track`,
      { cookie },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { data?: { link?: string }[] };
    const link = data.data?.[0]?.link;
    if (link) return link;
  }

  throw new Error('Nenhuma faixa encontrada no Deezer — use link deezer.com/track/… ou «Artista - Música»');
}

/** Deemix /getQueue — formatos já vistos: { queueList }, { queue: { queueList } }, { queue: { uuid: item } }. */
function parseDeemixQueuePayload(raw: unknown): Record<string, DeemixQueueItem> {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;

  const queueList = data.queueList;
  if (queueList && typeof queueList === 'object' && !Array.isArray(queueList)) {
    return queueList as Record<string, DeemixQueueItem>;
  }

  const queue = data.queue;
  if (queue && typeof queue === 'object' && !Array.isArray(queue)) {
    const nested = queue as Record<string, unknown>;
    const nestedList = nested.queueList;
    if (nestedList && typeof nestedList === 'object' && !Array.isArray(nestedList)) {
      return nestedList as Record<string, DeemixQueueItem>;
    }
    const hasUuidEntries = Object.values(nested).some(
      (v) => v && typeof v === 'object' && ('downloaded' in (v as object) || 'errors' in (v as object)),
    );
    if (hasUuidEntries) return nested as Record<string, DeemixQueueItem>;
  }

  return {};
}

function pickUuidFromUnknown(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const o = value as Record<string, unknown>;
  if (typeof o.uuid === 'string' && o.uuid.trim()) return o.uuid.trim();
  if (typeof o.id === 'string' && o.id.includes('_')) return o.id.trim();
  return undefined;
}

/** Resposta de /addToQueue — formatos: { obj }, { data: { obj } }, { result, data: { obj } }. */
function extractUuidFromDeemixAddResponse(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const root = raw as Record<string, unknown>;
  const buckets: unknown[] = [root.obj, root.data];
  if (root.data && typeof root.data === 'object') {
    buckets.push((root.data as Record<string, unknown>).obj);
  }

  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      for (const entry of bucket) {
        const uuid = pickUuidFromUnknown(entry);
        if (uuid) return uuid;
      }
    } else {
      const uuid = pickUuidFromUnknown(bucket);
      if (uuid) return uuid;
    }
  }
  return undefined;
}

async function deemixQueueUuidSet(cfg: DownloadEnv, cookie: string): Promise<Set<string>> {
  const res = await deemixFetch(cfg.deemixUrl, '/getQueue', { cookie });
  if (!res.ok) return new Set();
  const data = await res.json();
  return new Set(Object.keys(parseDeemixQueuePayload(data)));
}

async function deemixResolveQueueUuidAfterAdd(
  cfg: DownloadEnv,
  cookie: string,
  before: Set<string>,
): Promise<string | undefined> {
  const after = await deemixQueueUuidSet(cfg, cookie);
  for (const uuid of after) {
    if (!before.has(uuid)) return uuid;
  }
  return undefined;
}

function encodeDeemixRelPath(relPath: string): string {
  return relPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function copyDeemixOutputToDest(cfg: DownloadEnv, relFile: string, dest: string): Promise<void> {
  const rel = relFile.replace(/^\/+/, '');
  const errors: string[] = [];

  if (cfg.deemixFilesDir) {
    const localPath = path.join(cfg.deemixFilesDir, rel);
    try {
      await fsp.access(localPath);
      await fsp.copyFile(localPath, dest);
      return;
    } catch {
      errors.push(`disco ${localPath}`);
    }
  }

  const encoded = encodeDeemixRelPath(rel);
  const httpCandidates = [
    cfg.deemixMusicUrl ? `${cfg.deemixMusicUrl}/${encoded}` : null,
    `${cfg.deemixUrl}/downloads/${encoded}`,
    `${cfg.deemixUrl}/${encoded}`,
  ].filter(Boolean) as string[];

  for (const url of httpCandidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        errors.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro';
      errors.push(`${url} → ${msg}`);
    }
  }

  throw new Error(
    `Não foi possível ler o MP3 do Deemix (${rel}). Tentativas: ${errors.join(' | ')}. ` +
      'Configure CRIACAO_DEEMIX_FILES_DIR (pasta de downloads do Deemix) ou CRIACAO_DEEMIX_MUSIC_URL (porta 6596).',
  );
}

async function deemixWaitQueueItem(
  cfg: DownloadEnv,
  uuid: string,
  cookie: string,
): Promise<DeemixQueueItem> {
  const deadline = Date.now() + DEEMIX_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await deemixFetch(cfg.deemixUrl, '/getQueue', { cookie });
    if (!res.ok) throw new Error(`Deemix getQueue falhou (${res.status})`);
    const data = await res.json();
    const queueMap = parseDeemixQueuePayload(data);
    const item = queueMap[uuid];
    if (!item) {
      const keys = Object.keys(queueMap);
      throw new Error(
        keys.length > 0 ?
          `UUID ${uuid} não encontrado na fila do Deemix (fila tem ${keys.length} item(ns))`
        : 'Fila do Deemix vazia — addToQueue pode ter falhado silenciosamente',
      );
    }
    if ((item.errors ?? 0) > 0) {
      throw new Error('Deemix reportou erro no download (conta Deezer, ARL ou qualidade indisponível)');
    }
    if ((item.downloaded ?? 0) > 0) return item;
    await new Promise((r) => setTimeout(r, DEEMIX_POLL_MS));
  }
  throw new Error('Timeout aguardando Deemix (15 min)');
}

function deemixRelativeFile(entry: DeemixFileEntry | undefined): string | null {
  if (!entry) return null;
  if (typeof entry === 'string') return entry.replace(/^\/downloads\/\/?/, '');
  const fromPath = entry.path?.replace(/^\/downloads\/\/?/, '').trim();
  if (fromPath) return fromPath;
  return entry.filename?.trim() || null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'faixa.mp3';
}

async function refreshJobCounters(jobId: string): Promise<void> {
  await portalQuery(
    `UPDATE download_job j
        SET itens_feitos = (
              SELECT count(*)::int FROM download_item
               WHERE job_id = j.id AND status IN ('concluido', 'erro')
            ),
            status = CASE
              WHEN (SELECT count(*) FROM download_item WHERE job_id = j.id AND status IN ('aguardando', 'processando')) > 0
                THEN 'processando'::"DownloadJobStatus"
              WHEN (SELECT count(*) FROM download_item WHERE job_id = j.id AND status = 'erro') =
                   (SELECT count(*) FROM download_item WHERE job_id = j.id)
                THEN 'erro'::"DownloadJobStatus"
              ELSE 'concluido'::"DownloadJobStatus"
            END,
            finished_at = CASE
              WHEN (SELECT count(*) FROM download_item WHERE job_id = j.id AND status IN ('aguardando', 'processando')) = 0
                THEN now()
              ELSE NULL
            END,
            started_at = COALESCE(j.started_at, now()),
            updated_at = now()
      WHERE j.id = $1`,
    [jobId],
  );
}

async function failItem(itemId: string, jobId: string, msg: string): Promise<void> {
  await portalQuery(
    `UPDATE download_item SET status = 'erro', erro_msg = $2, updated_at = now() WHERE id = $1`,
    [itemId, msg.slice(0, 2000)],
  );
  await refreshJobCounters(jobId);
}

async function completeItem(
  itemId: string,
  jobId: string,
  filePath: string,
  meta: { titulo: string; artista: string; arquivoNome: string },
): Promise<void> {
  const stat = await fsp.stat(filePath);
  const key = downloadStagingKey(itemId);
  await portalQuery(
    `UPDATE download_item
        SET status = 'concluido',
            storage_key = $2,
            size_bytes = $3,
            titulo = $4,
            artista = $5,
            arquivo_nome = $6,
            erro_msg = '',
            updated_at = now()
      WHERE id = $1`,
    [
      itemId,
      key,
      stat.size,
      meta.titulo.slice(0, 500),
      meta.artista.slice(0, 500),
      meta.arquivoNome.slice(0, 500),
    ],
  );
  await refreshJobCounters(jobId);
}

function authHeaders(token: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function spotifyTrackId(line: string): string | null {
  const m = /spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/i.exec(line);
  return m?.[1] ?? null;
}

function youtubeUrl(line: string): string | null {
  if (/youtube\.com|youtu\.be|music\.youtube\.com/i.test(line)) return line;
  return null;
}

async function downloadSpotizerr(item: PendingItem, cfg: DownloadEnv): Promise<void> {
  if (!cfg.spotizerrUrl) {
    await failItem(item.id, item.job_id, 'Spotizerr não configurado (CRIACAO_SPOTIZERR_URL)');
    return;
  }

  const trackId = spotifyTrackId(item.linha_original);
  let downloadUrl = trackId ? `${cfg.spotizerrUrl}/api/track/download/${trackId}` : null;

  if (!downloadUrl) {
    const searchRes = await fetch(
      `${cfg.spotizerrUrl}/api/search/?q=${encodeURIComponent(item.linha_original)}&type=track&limit=1`,
      { headers: authHeaders(cfg.spotizerrToken) },
    );
    if (!searchRes.ok) {
      await failItem(item.id, item.job_id, `Spotizerr busca falhou (${searchRes.status})`);
      return;
    }
    const searchData = (await searchRes.json()) as { tracks?: { id?: string; name?: string; artists?: { name?: string }[] }[] };
    const first = searchData.tracks?.[0];
    if (!first?.id) {
      await failItem(item.id, item.job_id, 'Nenhuma faixa encontrada no Spotify');
      return;
    }
    downloadUrl = `${cfg.spotizerrUrl}/api/track/download/${first.id}`;
  }

  const res = await fetch(downloadUrl, { headers: authHeaders(cfg.spotizerrToken) });
  if (!res.ok) {
    await failItem(item.id, item.job_id, `Spotizerr download falhou (${res.status})`);
    return;
  }

  ensureStorageDirs();
  const dest = downloadStagingPath(item.id);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);

  const baseName = sanitizeFilename(path.basename(item.linha_original, path.extname(item.linha_original)));
  await completeItem(item.id, item.job_id, dest, {
    titulo: baseName,
    artista: '',
    arquivoNome: `${baseName}.mp3`,
  });
}

async function downloadDeemix(item: PendingItem, cfg: DownloadEnv): Promise<void> {
  if (!cfg.deemixUrl) {
    await failItem(item.id, item.job_id, 'Deemix não configurado (CRIACAO_DEEMIX_URL)');
    return;
  }

  try {
    const cookie = await deemixEnsureSession(cfg);
    const trackUrl = await deemixResolveTrackUrl(cfg, item.linha_original, cookie);
    const queueBefore = await deemixQueueUuidSet(cfg, cookie);

    const queueRes = await deemixFetch(cfg.deemixUrl, '/addToQueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trackUrl, bitrate: DEEMIX_BITRATE }),
      cookie,
    });
    const rawBody = await queueRes.text();
    let queueData: unknown = null;
    try {
      queueData = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      await failItem(
        item.id,
        item.job_id,
        `Deemix addToQueue respondeu conteúdo inválido (HTTP ${queueRes.status})`,
      );
      return;
    }

    const parsed = queueData as { result?: boolean; errid?: string };
    if (queueRes.ok && parsed.result !== false) {
      // ok — segue para uuid
    } else {
      const err =
        parsed.errid === 'NotLoggedIn' ?
          'Deemix não logado — configure CRIACAO_DEEMIX_ARL no cloud2'
        : parsed.errid === 'CantStream' ?
          'Deemix: qualidade indisponível na conta Deezer (use bitrate 128k / CRIACAO_DEEMIX_BITRATE=1)'
        : parsed.errid === 'AlreadyInQueue' ?
          'Faixa já estava na fila do Deemix — tentando retomar'
        : `Deemix addToQueue falhou (HTTP ${queueRes.status}, ${parsed.errid ?? 'erro'})`;
      if (parsed.errid !== 'AlreadyInQueue') {
        await failItem(item.id, item.job_id, err);
        return;
      }
    }

    let uuid =
      extractUuidFromDeemixAddResponse(queueData) ??
      (await deemixResolveQueueUuidAfterAdd(cfg, cookie, queueBefore));
    if (!uuid) {
      const hint = rawBody.slice(0, 240).replace(/\s+/g, ' ');
      await failItem(
        item.id,
        item.job_id,
        `Deemix não retornou uuid na fila${hint ? ` — resposta: ${hint}` : ''}`,
      );
      return;
    }

    const done = await deemixWaitQueueItem(cfg, uuid, cookie);
    const relFile = deemixRelativeFile(done.files?.[0]);
    if (!relFile) {
      await failItem(item.id, item.job_id, 'Deemix concluiu sem caminho de arquivo');
      return;
    }

    ensureStorageDirs();
    const dest = downloadStagingPath(item.id);
    await copyDeemixOutputToDest(cfg, relFile, dest);

    const titulo = done.title ?? item.linha_original;
    const artista = typeof done.artist === 'string' ? done.artist : '';
    await completeItem(item.id, item.job_id, dest, {
      titulo,
      artista,
      arquivoNome: sanitizeFilename(path.basename(relFile) || `${artista} - ${titulo}.mp3`),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro_deemix';
    await failItem(item.id, item.job_id, msg);
  }
}

async function downloadYoutube(item: PendingItem, cfg: DownloadEnv): Promise<void> {
  if (!cfg.youtubeDlUrl) {
    await failItem(item.id, item.job_id, 'YouTube DL não configurado (CRIACAO_YOUTUBE_DL_URL)');
    return;
  }

  let url = youtubeUrl(item.linha_original);
  if (!url) {
    url = `ytsearch1:${item.linha_original}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.youtubeDlApiKey) headers.Authorization = `Bearer ${cfg.youtubeDlApiKey}`;

  const body =
    url.startsWith('ytsearch') ?
      { query: item.linha_original, format: 'bestaudio/best', max_size_mb: 50 }
    : { url, format: 'bestaudio/best', max_size_mb: 50 };

  const postUrl = url.startsWith('ytsearch') ?
    `${cfg.youtubeDlUrl}/download_video`
  : `${cfg.youtubeDlUrl}/download_video`;

  const start = await fetch(postUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!start.ok) {
    await failItem(item.id, item.job_id, `YouTube API falhou (${start.status})`);
    return;
  }

  const task = (await start.json()) as { task_id?: string; status?: string; file_path?: string };
  const taskId = task.task_id;
  if (!taskId) {
    await failItem(item.id, item.job_id, 'YouTube API não retornou task_id');
    return;
  }

  let filePath: string | null = task.file_path ?? null;
  for (let i = 0; i < 90 && !filePath; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${cfg.youtubeDlUrl}/status/${taskId}`, { headers });
    if (!st.ok) continue;
    const stData = (await st.json()) as { status?: string; file_path?: string; error?: string };
    if (stData.status === 'failed' || stData.status === 'error') {
      await failItem(item.id, item.job_id, stData.error ?? 'Download YouTube falhou');
      return;
    }
    if (stData.status === 'completed' && stData.file_path) filePath = stData.file_path;
  }

  if (!filePath) {
    await failItem(item.id, item.job_id, 'Timeout aguardando download YouTube');
    return;
  }

  ensureStorageDirs();
  const dest = downloadStagingPath(item.id);
  await fsp.copyFile(filePath, dest);

  const baseName = sanitizeFilename(item.linha_original.slice(0, 80));
  await completeItem(item.id, item.job_id, dest, {
    titulo: baseName,
    artista: '',
    arquivoNome: `${baseName}.mp3`,
  });
}

async function processOne(item: PendingItem, cfg: DownloadEnv): Promise<void> {
  switch (item.provider) {
    case 'spotizerr':
      await downloadSpotizerr(item, cfg);
      break;
    case 'deemix':
      await downloadDeemix(item, cfg);
      break;
    case 'youtube':
      await downloadYoutube(item, cfg);
      break;
    default:
      await failItem(item.id, item.job_id, `Provider desconhecido: ${item.provider}`);
  }
}

/** Processa itens pendentes — download 100% no servidor. */
export async function processPendingDownloads(limit = 10): Promise<number> {
  ensureStorageDirs();
  const cfg = env();

  const claimed = await portalQuery<PendingItem>(
    `WITH picked AS (
       SELECT di.id
         FROM download_item di
         JOIN download_job dj ON dj.id = di.job_id
        WHERE di.status = 'aguardando'
          AND dj.status NOT IN ('cancelado', 'concluido')
        ORDER BY di.created_at ASC
        LIMIT $1
        FOR UPDATE OF di SKIP LOCKED
     )
     UPDATE download_item i
        SET status = 'processando', updated_at = now()
       FROM picked p, download_job dj
      WHERE i.id = p.id
        AND dj.id = i.job_id
      RETURNING i.id, i.job_id, dj.provider::text AS provider, i.linha_original, i.input_tipo`,
    [Math.min(50, Math.max(1, limit))],
  );

  let processed = 0;
  for (const row of claimed.rows) {
    try {
      await processOne(row, cfg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erro_desconhecido';
      await failItem(row.id, row.job_id, msg);
    }
    processed++;
  }

  return processed;
}
