import fsp from 'node:fs/promises';
import path from 'node:path';
import { criacaoConfig } from './config.js';
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
  youtubeDlUrl: string;
  youtubeDlApiKey: string;
};

function env(): DownloadEnv {
  return {
    spotizerrUrl: (process.env.CRIACAO_SPOTIZERR_URL ?? '').replace(/\/$/, ''),
    spotizerrToken: process.env.CRIACAO_SPOTIZERR_TOKEN ?? '',
    deemixUrl: (process.env.CRIACAO_DEEMIX_URL ?? '').replace(/\/$/, ''),
    youtubeDlUrl: (process.env.CRIACAO_YOUTUBE_DL_URL ?? '').replace(/\/$/, ''),
    youtubeDlApiKey: process.env.CRIACAO_YOUTUBE_DL_API_KEY ?? '',
  };
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

async function authHeaders(token: string): Record<string, string> {
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
      { headers: await authHeaders(cfg.spotizerrToken) },
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

  const res = await fetch(downloadUrl, { headers: await authHeaders(cfg.spotizerrToken) });
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

  const q = encodeURIComponent(item.linha_original);
  const res = await fetch(`${cfg.deemixUrl}/api/search?q=${q}&limit=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    await failItem(item.id, item.job_id, `Deemix busca falhou (${res.status}) — verifique API do container`);
    return;
  }

  const data = (await res.json()) as { data?: { id?: number; title?: string; artist?: { name?: string } }[] };
  const track = data.data?.[0];
  if (!track?.id) {
    await failItem(item.id, item.job_id, 'Nenhuma faixa encontrada no Deezer');
    return;
  }

  const dl = await fetch(`${cfg.deemixUrl}/api/download/${track.id}`, { method: 'POST' });
  if (!dl.ok) {
    await failItem(item.id, item.job_id, `Deemix download falhou (${dl.status})`);
    return;
  }

  const fileBuf = Buffer.from(await dl.arrayBuffer());
  ensureStorageDirs();
  const dest = downloadStagingPath(item.id);
  await fsp.writeFile(dest, fileBuf);

  const titulo = track.title ?? item.linha_original;
  const artista = track.artist?.name ?? '';
  await completeItem(item.id, item.job_id, dest, {
    titulo,
    artista,
    arquivoNome: sanitizeFilename(`${artista} - ${titulo}.mp3`),
  });
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
       FROM picked p
       JOIN download_job dj ON dj.id = i.job_id
      WHERE i.id = p.id
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
