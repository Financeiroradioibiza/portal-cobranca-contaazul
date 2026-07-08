import fsp from 'node:fs/promises';
import path from 'node:path';
import { portalQuery } from './portalDb.js';
import {
  downloadStagingKey,
  downloadStagingPath,
  ensureStorageDirs,
} from './storage.js';
import {
  assertValidMp3File,
} from './mp3Validate.js';
import { resolveDeezerTrackUrlFromText } from './deezerTrackMatch.js';
import { downloadDeezerTrackToFile } from './deemixDirectDownload.js';

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
  deemixArl: string;
  youtubeDlUrl: string;
  youtubeDlApiKey: string;
};

/** deemix-js: 1=128k, 3=320k (Premium), 9=FLAC */
const DEEMIX_BITRATE = Number(process.env.CRIACAO_DEEMIX_BITRATE ?? '3') || 3;

function env(): DownloadEnv {
  return {
    spotizerrUrl: (process.env.CRIACAO_SPOTIZERR_URL ?? '').replace(/\/$/, ''),
    spotizerrToken: process.env.CRIACAO_SPOTIZERR_TOKEN ?? '',
    deemixArl: (process.env.CRIACAO_DEEMIX_ARL ?? '').replace(/\s+/g, ''),
    youtubeDlUrl: (process.env.CRIACAO_YOUTUBE_DL_URL ?? '').replace(/\/$/, ''),
    youtubeDlApiKey: process.env.CRIACAO_YOUTUBE_DL_API_KEY ?? '',
  };
}

const DEEZER_SHARE_RE = /^https?:\/\/link\.deezer\.com\//i;

function toCanonicalDeemixUrl(input: string): string | null {
  const trimmed = input.trim().split('#')[0]?.split('?')[0]?.trim() ?? '';
  const m = trimmed.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/i);
  if (!m) return null;
  return `https://www.deezer.com/${m[1]!.toLowerCase()}/${m[2]}`;
}

async function resolveDeezerShareUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!DEEZER_SHARE_RE.test(trimmed)) return trimmed;
  const res = await fetch(trimmed, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: 'text/html,application/json', 'User-Agent': 'RadioIbizaDownload/1.0' },
  });
  const canonical = res.url ? toCanonicalDeemixUrl(res.url) : null;
  if (canonical) return canonical;
  throw new Error('Link curto deezer.com/s/… — use www.deezer.com/track/… ou Artista - Música');
}

async function normalizeLineForDeemix(line: string): Promise<string> {
  const resolved = await resolveDeezerShareUrl(line);
  const canonical = toCanonicalDeemixUrl(resolved);
  if (canonical) return canonical;
  return resolved.trim();
}

async function deemixResolveTrackUrl(_cfg: DownloadEnv, line: string, _cookie: string): Promise<string> {
  const normalized = await normalizeLineForDeemix(line);
  const canonical = toCanonicalDeemixUrl(normalized);

  if (canonical?.includes('/playlist/') || canonical?.includes('/album/')) {
    throw new Error(
      'Playlist/álbum deve ser expandido em faixas pelo portal — cole o link curto ou playlist no Download link (não faixa a faixa no Deemix).',
    );
  }

  if (canonical?.includes('/track/')) return canonical;

  return resolveDeezerTrackUrlFromText(normalized);
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
  const { size } = await assertValidMp3File(filePath);
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
      size,
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
  if (!cfg.deemixArl) {
    await failItem(item.id, item.job_id, 'CRIACAO_DEEMIX_ARL não configurado no cloud2');
    return;
  }

  try {
    const trackUrl = await deemixResolveTrackUrl(cfg, item.linha_original, '');
    ensureStorageDirs();
    const dest = downloadStagingPath(item.id);
    const meta = await downloadDeezerTrackToFile({
      trackUrl,
      arl: cfg.deemixArl,
      destPath: dest,
      bitrate: DEEMIX_BITRATE,
    });
    await completeItem(item.id, item.job_id, dest, {
      titulo: meta.titulo,
      artista: meta.artista,
      arquivoNome: sanitizeFilename(meta.arquivoNome || `${meta.artista} - ${meta.titulo}.mp3`),
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
          AND COALESCE(di.erro_msg, '') NOT LIKE '__DEEZER_PICK__%'
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
