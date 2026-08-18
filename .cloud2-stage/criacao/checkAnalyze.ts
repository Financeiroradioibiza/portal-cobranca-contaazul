import fsp from 'node:fs/promises';
import { portalQuery } from './portalDb.js';
import { sha256File } from './hash.js';
import { probeDurationMs, probeArtistTitleFromFile } from './ffmpeg.js';
import { parseMp3Filename } from './parseFilename.js';
import {
  artistaMatchesForCheck,
  metadataMatchesForCheck,
  normalizeArtistaForDedupe,
  tituloCoreForCheck,
  tituloMatchesForCheck,
} from './dedupe.js';
import { checkFilePath } from './checkStorage.js';
import { spawn } from 'node:child_process';

export type CheckPastaTrack = {
  musicaId: string;
  artista: string;
  titulo: string;
  durationMs: number | null;
};

export type CheckAnalyzeRow = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

export type CheckFileResult = {
  fileId: string;
  arquivoNome: string;
  uploadArtista: string;
  uploadTitulo: string;
  durationMs: number | null;
  sizeBytes: number;
  contentHash: string | null;
  chromaprint: string | null;
  matchedMusicaId: string | null;
  matchScore: number;
  verdict: 'mesma_gravacao' | 'provavelmente_mesma' | 'revisar_possivel_versao' | 'diferente' | 'sem_par_na_pasta';
  checks: CheckAnalyzeRow[];
  sistemaArtista: string | null;
  sistemaTitulo: string | null;
  sistemaDurationMs: number | null;
  sistemaChromaprint: string | null;
};

type SistemaTrack = CheckPastaTrack & {
  chromaprint: string | null;
  contentHash: string | null;
};

async function tryChromaprint(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('fpcalc', ['-json', '-length', '90', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      finish(null);
    }, 25_000);
    proc.stdout?.on('data', (d) => {
      out += String(d);
    });
    proc.on('error', () => finish(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      try {
        const j = JSON.parse(out) as { fingerprint?: string };
        const fp = j.fingerprint?.trim();
        finish(fp && fp.length > 20 ? fp.slice(0, 4000) : null);
      } catch {
        finish(null);
      }
    });
  });
}

function chromaprintPrefixSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const min = Math.min(a.length, b.length, 120);
  if (min < 20) return 0;
  let same = 0;
  for (let i = 0; i < min; i += 1) {
    if (a[i] === b[i]) same += 1;
  }
  return same / min;
}

function durationScore(uploadMs: number | null, sistemaMs: number | null): { score: number; detail: string } {
  if (uploadMs == null || uploadMs <= 0 || sistemaMs == null || sistemaMs <= 0) {
    return { score: 0, detail: 'Duração indisponível em um dos lados' };
  }
  const delta = Math.abs(uploadMs - sistemaMs);
  if (delta <= 500) return { score: 20, detail: `Duração quase idêntica (Δ ${(delta / 1000).toFixed(1)}s)` };
  if (delta <= 2000) return { score: 15, detail: `Duração próxima (Δ ${(delta / 1000).toFixed(1)}s)` };
  if (delta <= 4000) return { score: 8, detail: `Duração parecida (Δ ${(delta / 1000).toFixed(1)}s)` };
  return { score: 0, detail: `Duração diferente (Δ ${(delta / 1000).toFixed(1)}s)` };
}

function metadataScore(
  uploadArtista: string,
  uploadTitulo: string,
  sistema: SistemaTrack,
): { score: number; detail: string; ok: boolean } {
  const metaOk = metadataMatchesForCheck(uploadArtista, uploadTitulo, sistema.artista, sistema.titulo);
  const tituloOk = tituloMatchesForCheck(uploadTitulo, sistema.titulo);
  const artistaOk = artistaMatchesForCheck(uploadArtista, sistema.artista);
  if (metaOk) {
    return { score: 30, detail: 'Artista e título equivalentes (núcleo da faixa)', ok: true };
  }
  if (tituloOk && artistaOk) {
    return { score: 28, detail: 'Artista e título equivalentes (normalização CHECK)', ok: true };
  }
  if (tituloOk) {
    return { score: 12, detail: 'Só o título bate — artista diferente', ok: false };
  }
  return {
    score: 0,
    detail: `Metadados distintos (${normalizeArtistaForDedupe(uploadArtista)} — ${tituloCoreForCheck(uploadTitulo)} vs ${normalizeArtistaForDedupe(sistema.artista)} — ${tituloCoreForCheck(sistema.titulo)})`,
    ok: false,
  };
}

function findBestMetadataMatch(
  uploadArtista: string,
  uploadTitulo: string,
  tracks: SistemaTrack[],
): SistemaTrack | null {
  for (const t of tracks) {
    if (metadataMatchesForCheck(uploadArtista, uploadTitulo, t.artista, t.titulo)) return t;
  }
  for (const t of tracks) {
    if (tituloMatchesForCheck(uploadTitulo, t.titulo) && artistaMatchesForCheck(uploadArtista, t.artista)) {
      return t;
    }
  }
  for (const t of tracks) {
    if (tituloMatchesForCheck(uploadTitulo, t.titulo)) return t;
  }
  return null;
}

async function loadSistemaTracks(tracks: CheckPastaTrack[]): Promise<SistemaTrack[]> {
  const ids = tracks.map((t) => t.musicaId).filter(Boolean);
  if (!ids.length) return [];
  const res = await portalQuery<{
    id: string;
    artista: string;
    titulo: string;
    duration_ms: number | null;
    chromaprint: string | null;
    content_hash: string | null;
  }>(
    `SELECT id, artista, titulo, duration_ms, chromaprint, content_hash
       FROM musica_biblioteca
      WHERE id = ANY($1::text[])`,
    [ids],
  );
  const byId = new Map(res.rows.map((r) => [r.id, r]));
  return tracks.map((t) => {
    const row = byId.get(t.musicaId);
    return {
      musicaId: t.musicaId,
      artista: row?.artista?.trim() || t.artista,
      titulo: row?.titulo?.trim() || t.titulo,
      durationMs: row?.duration_ms ?? t.durationMs,
      chromaprint: row?.chromaprint?.trim() || null,
      contentHash: row?.content_hash?.trim() || null,
    };
  });
}

function verdictFromScore(
  score: number,
  chromaprintExact: boolean,
  metadataOk: boolean,
  hasMatch: boolean,
): CheckFileResult['verdict'] {
  if (!hasMatch) return 'sem_par_na_pasta';
  if (chromaprintExact || score >= 85) return 'mesma_gravacao';
  if (score >= 60) return 'provavelmente_mesma';
  if (score >= 30 || metadataOk) return 'revisar_possivel_versao';
  return 'diferente';
}

async function analyzeUploadFile(
  sessionId: string,
  fileId: string,
  arquivoNome: string,
  ext: string,
  sistemaTracks: SistemaTrack[],
): Promise<CheckFileResult> {
  const filePath = checkFilePath(sessionId, fileId, ext);
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat) {
    return {
      fileId,
      arquivoNome,
      uploadArtista: '',
      uploadTitulo: '',
      durationMs: null,
      sizeBytes: 0,
      contentHash: null,
      chromaprint: null,
      matchedMusicaId: null,
      matchScore: 0,
      verdict: 'sem_par_na_pasta',
      checks: [{ id: 'arquivo', ok: false, label: 'Arquivo', detail: 'Arquivo não encontrado no scratch' }],
      sistemaArtista: null,
      sistemaTitulo: null,
      sistemaDurationMs: null,
      sistemaChromaprint: null,
    };
  }

  const fromName = parseMp3Filename(arquivoNome);
  const [tags, durationMs, chromaprint, contentHash] = await Promise.all([
    probeArtistTitleFromFile(filePath).catch(() => null),
    probeDurationMs(filePath).catch(() => null),
    tryChromaprint(filePath),
    sha256File(filePath).catch(() => null),
  ]);
  const uploadArtista = tags?.artista?.trim() || fromName.artista;
  const uploadTitulo = tags?.titulo?.trim() || fromName.titulo;

  const matched = findBestMetadataMatch(uploadArtista, uploadTitulo, sistemaTracks);
  const checks: CheckAnalyzeRow[] = [];

  if (!matched) {
    checks.push({
      id: 'par',
      ok: false,
      label: 'Par na pasta',
      detail: 'Nenhuma faixa da pasta com artista/título correspondente',
    });
    return {
      fileId,
      arquivoNome,
      uploadArtista,
      uploadTitulo,
      durationMs,
      sizeBytes: stat.size,
      contentHash,
      chromaprint,
      matchedMusicaId: null,
      matchScore: 0,
      verdict: 'sem_par_na_pasta',
      checks,
      sistemaArtista: null,
      sistemaTitulo: null,
      sistemaDurationMs: null,
      sistemaChromaprint: null,
    };
  }

  let score = 0;
  const meta = metadataScore(uploadArtista, uploadTitulo, matched);
  score += meta.score;
  checks.push({ id: 'metadata', ok: meta.ok, label: 'Artista e título', detail: meta.detail });

  const dur = durationScore(durationMs, matched.durationMs);
  score += dur.score;
  checks.push({ id: 'duration', ok: dur.score >= 15, label: 'Duração', detail: dur.detail });

  let chromaprintExact = false;
  if (chromaprint && matched.chromaprint) {
    chromaprintExact = chromaprint === matched.chromaprint;
    const prefixSim = chromaprintPrefixSimilarity(chromaprint, matched.chromaprint);
    if (chromaprintExact) {
      score += 40;
      checks.push({
        id: 'chromaprint',
        ok: true,
        label: 'Fingerprint (Chromaprint)',
        detail: 'Idêntico — mesma gravação (estilo Shazam)',
      });
    } else if (prefixSim >= 0.75) {
      score += 25;
      checks.push({
        id: 'chromaprint',
        ok: false,
        label: 'Fingerprint (Chromaprint)',
        detail: `Similar (${Math.round(prefixSim * 100)}%) — possível remaster/versão`,
      });
    } else {
      checks.push({
        id: 'chromaprint',
        ok: false,
        label: 'Fingerprint (Chromaprint)',
        detail: 'Diferente — provável outra versão ou faixa distinta',
      });
    }
  } else {
    checks.push({
      id: 'chromaprint',
      ok: false,
      label: 'Fingerprint (Chromaprint)',
      detail: chromaprint ? 'Sistema sem fingerprint salvo' : 'fpcalc indisponível ou falhou',
    });
  }

  if (contentHash && matched.contentHash) {
    const hashOk = contentHash === matched.contentHash;
    if (hashOk) score += 10;
    checks.push({
      id: 'hash',
      ok: hashOk,
      label: 'Hash do arquivo',
      detail: hashOk ? 'Bytes idênticos' : 'Arquivos diferentes (encode/master distinto)',
    });
  }

  checks.push({
    id: 'tamanho',
    ok: true,
    label: 'Tamanho do upload',
    detail: `${Math.round(stat.size / 1024)} KB`,
  });

  const verdict = verdictFromScore(score, chromaprintExact, meta.ok, true);

  return {
    fileId,
    arquivoNome,
    uploadArtista,
    uploadTitulo,
    durationMs,
    sizeBytes: stat.size,
    contentHash,
    chromaprint,
    matchedMusicaId: matched.musicaId,
    matchScore: Math.min(100, score),
    verdict,
    checks,
    sistemaArtista: matched.artista,
    sistemaTitulo: matched.titulo,
    sistemaDurationMs: matched.durationMs,
    sistemaChromaprint: matched.chromaprint,
  };
}

export async function analyzeCheckSession(input: {
  sessionId: string;
  files: Array<{ fileId: string; arquivoNome: string; ext?: string }>;
  pastaTracks: CheckPastaTrack[];
  fileId?: string;
  fileIds?: string[];
}): Promise<CheckFileResult[]> {
  const sistemaTracks = await loadSistemaTracks(input.pastaTracks);
  const fileIdsFilter = input.fileIds?.map((id) => id.trim()).filter(Boolean);
  const fileIdFilter = input.fileId?.trim();
  const targets =
    fileIdsFilter?.length ?
      input.files.filter((f) => fileIdsFilter.includes(f.fileId))
    : fileIdFilter ?
      input.files.filter((f) => f.fileId === fileIdFilter)
    : input.files;
  const out: CheckFileResult[] = [];
  for (const f of targets) {
    out.push(
      await analyzeUploadFile(input.sessionId, f.fileId, f.arquivoNome, f.ext || '.mp3', sistemaTracks),
    );
  }
  return out;
}
