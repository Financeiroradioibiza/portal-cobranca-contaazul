/**
 * Download Deezer → MP3 local via deemix-js (deezer-js + ARL).
 * Não depende de volume compartilhado nem da porta 6596 do Deemix remoto.
 */
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fetchDeezerTrackDisplayMeta } from './deezerArtistDisplay.js';

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

function extractTrackId(trackUrl: string): string | null {
  const m = trackUrl.match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/i);
  return m?.[1] ?? null;
}

function canonicalTrackUrl(trackUrl: string): string {
  const id = extractTrackId(trackUrl);
  if (!id) return trackUrl.trim();
  return `https://www.deezer.com/track/${id}`;
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

type DeemixRunResult = {
  mp3s: string[];
  downloadObject: { title?: string; artist?: string };
  warnings: string[];
};

async function runDeemixOnce(
  dz: DeezerSession,
  trackUrl: string,
  workDir: string,
  bitrate: number,
): Promise<DeemixRunResult> {
  const warnings: string[] = [];
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

  const downloadObject = await generateDownloadObject(dz, trackUrl, bitrate);
  downloadObject.uuid = `cloud2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const listener = {
    send(event: string, payload?: { data?: { message?: string; title?: string }; state?: string }) {
      if (event === 'downloadWarn' || event === 'errorPlaceHolder') {
        const msg = payload?.data?.message ?? payload?.state ?? '';
        if (msg) warnings.push(String(msg).slice(0, 200));
      }
    },
  };

  const dl = new Downloader(dz, downloadObject, settings, listener);
  await dl.start();

  const mp3s = await collectMp3Files(workDir);
  return { mp3s, downloadObject, warnings };
}

async function preflightTrackReadable(dz: DeezerSession, trackId: string): Promise<void> {
  try {
    const track = (await dz.api.getTrack(trackId)) as { readable?: boolean; title?: string } | null;
    if (track && track.readable === false) {
      throw new Error(
        `Faixa ${trackId} existe no Deezer mas não está liberada para download nesta conta (readable=false).`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('readable=false')) throw e;
    // API indisponível — tenta download mesmo assim
  }
}

/** Baixa faixa Deezer para dest (path absoluto do staging). */
export async function downloadDeezerTrackToFile(opts: {
  trackUrl: string;
  arl: string;
  destPath: string;
  bitrate?: number;
}): Promise<DirectDeemixResult> {
  const primaryBitrate = opts.bitrate ?? (Number(process.env.CRIACAO_DEEMIX_BITRATE ?? '3') || 3);
  const trackUrl = canonicalTrackUrl(opts.trackUrl);
  const trackId = extractTrackId(trackUrl);
  if (!trackId) {
    throw new Error('URL Deezer inválida — use https://www.deezer.com/track/…');
  }

  const dz = await getDeezerSession(opts.arl);
  await preflightTrackReadable(dz, trackId);

  const bitrates = [primaryBitrate];
  if (primaryBitrate !== 1) bitrates.push(1);

  const allWarnings: string[] = [];
  let lastResult: DeemixRunResult | null = null;

  for (const bitrate of bitrates) {
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'deemix-dl-'));
    try {
      const result = await runDeemixOnce(dz, trackUrl, workDir, bitrate);
      lastResult = result;
      allWarnings.push(...result.warnings);

      if (result.mp3s.length === 0) continue;

      result.mp3s.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
      await fsp.copyFile(result.mp3s[0]!, opts.destPath);

      const apiMeta = await fetchDeezerTrackDisplayMeta(trackUrl);
      const titulo = String(
        result.downloadObject.title ?? apiMeta?.titulo ?? path.basename(result.mp3s[0]!, '.mp3'),
      ).trim();
      const artista = String(apiMeta?.artista || result.downloadObject.artist || '').trim();

      return {
        titulo,
        artista,
        arquivoNome: buildCanonicalMp3Name(artista, titulo),
      };
    } finally {
      await removeTree(workDir);
    }
  }

  const hint =
    allWarnings.length > 0 ?
      allWarnings.slice(0, 2).join(' · ')
    : 'Tente colar o link manual no Download link ou escolha outra versão no Match.';
  const brHint = bitrates.length > 1 ? ` (tentou ${bitrates.join('k→')}kbps)` : '';
  throw new Error(
    `Deemix não gerou MP3 — track ${trackId}${brHint}. ${hint}`,
  );
}
