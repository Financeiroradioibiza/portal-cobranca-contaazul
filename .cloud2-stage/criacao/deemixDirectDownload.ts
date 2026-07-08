/**
 * Download Deezer → MP3 local via deemix-js (deezer-js + ARL).
 * Não depende de volume compartilhado nem da porta 6596 do Deemix remoto.
 */
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Deezer } = require('deezer-js');
const deemix = require('deemix');
const { Downloader } = deemix.downloader;
const { generateDownloadObject } = deemix;
const { DEFAULTS } = deemix.settings;

type DeezerSession = InstanceType<typeof Deezer>;

let cachedSession: { arl: string; dz: DeezerSession } | null = null;

async function getDeezerSession(arl: string): Promise<DeezerSession> {
  const normalized = arl.replace(/\s+/g, '');
  if (cachedSession?.arl === normalized) return cachedSession.dz;
  const dz = new Deezer();
  const ok = await dz.login_via_arl(normalized);
  if (!ok) {
    throw new Error('ARL Deezer inválido ou expirado — atualize CRIACAO_DEEMIX_ARL no cloud2');
  }
  cachedSession = { arl: normalized, dz };
  return dz;
}

async function collectMp3Files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...(await collectMp3Files(full)));
    else if (/\.mp3$/i.test(name.name)) out.push(full);
  }
  return out;
}

async function removeTree(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

export type DirectDeemixResult = {
  titulo: string;
  artista: string;
  arquivoNome: string;
};

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

function buildCanonicalMp3Name(artista: string, titulo: string): string {
  const a = sanitizeFilenamePart(artista);
  const t = sanitizeFilenamePart(titulo) || 'Faixa';
  return a ? `${a} - ${t}.mp3` : `${t}.mp3`;
}

/** Metadados públicos da faixa — fallback quando deemix-js não preenche artista. */
async function fetchDeezerTrackMeta(trackUrl: string): Promise<{ titulo: string; artista: string } | null> {
  const m = trackUrl.match(/\/track\/(\d+)/i);
  if (!m) return null;
  try {
    const res = await fetch(`https://api.deezer.com/track/${m[1]}`, {
      headers: { 'User-Agent': 'RadioIbizaCloud2/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; artist?: { name?: string } };
    const titulo = String(data.title ?? '').trim();
    const artista = String(data.artist?.name ?? '').trim();
    if (!titulo) return null;
    return { titulo, artista };
  } catch {
    return null;
  }
}

/** Baixa faixa Deezer para dest (path absoluto do staging). */
export async function downloadDeezerTrackToFile(opts: {
  trackUrl: string;
  arl: string;
  destPath: string;
  bitrate?: number;
}): Promise<DirectDeemixResult> {
  const bitrate = opts.bitrate ?? (Number(process.env.CRIACAO_DEEMIX_BITRATE ?? '3') || 3);
  const dz = await getDeezerSession(opts.arl);
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'deemix-dl-'));

  try {
    const settings = {
      ...DEFAULTS,
      downloadLocation: workDir,
      maxBitrate: String(bitrate),
      overwriteFile: 'y',
      createArtistFolder: false,
      createAlbumFolder: false,
      createPlaylistFolder: false,
      createSingleFolder: true,
      saveArtwork: false,
      queueConcurrency: 1,
    };

    const downloadObject = await generateDownloadObject(dz, opts.trackUrl, bitrate);
    downloadObject.uuid = `cloud2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const dl = new Downloader(dz, downloadObject, settings, null);
    await dl.start();

    const mp3s = await collectMp3Files(workDir);
    if (mp3s.length === 0) {
      throw new Error('Deemix concluiu sem gerar MP3 — faixa indisponível na conta Deezer?');
    }

    mp3s.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
    await fsp.copyFile(mp3s[0]!, opts.destPath);

    const apiMeta = await fetchDeezerTrackMeta(opts.trackUrl);
    const titulo = String(downloadObject.title ?? apiMeta?.titulo ?? path.basename(mp3s[0]!, '.mp3')).trim();
    const artista = String(downloadObject.artist ?? apiMeta?.artista ?? '').trim();

    return {
      titulo,
      artista,
      arquivoNome: buildCanonicalMp3Name(artista, titulo),
    };
  } finally {
    await removeTree(workDir);
  }
}
