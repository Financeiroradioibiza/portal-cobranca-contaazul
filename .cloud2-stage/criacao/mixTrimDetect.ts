import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** Janelas de ~100 ms para análise do final da faixa. */
const SR = 11025;
const WIN = 1102;
const HOP = 1102;
export const HOP_SEC = HOP / SR;

export type MixTrimResult = {
  /** Segundos finais onde começa o crossfade (0 = sem fade de rádio detectado). */
  mixSegundosFinais: number;
  /** Corta silêncio morto ou cauda baixa/ruído após o fim da música (ms). */
  trimFimMs: number;
  trimInicioMs: 0;
  /** Outro contínuo baixo no fim (violão/voz baixa, ex. What's Up) — mix fica 0. */
  quietOutro: boolean;
  envelopeOk: boolean;
};

function frames(sec: number): number {
  return Math.max(1, Math.round(sec / HOP_SEC));
}

function median(values: Float32Array | number[]): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Decodifica mono PCM para envelope RMS. */
async function loadEnvelope(inputPath: string): Promise<Float32Array | null> {
  try {
    const { stdout } = await pexec(
      'ffmpeg',
      ['-v', 'quiet', '-i', inputPath, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
      { maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' } as Parameters<typeof pexec>[2],
    );
    const buf = stdout as unknown as Buffer;
    const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
    if (samples.length < SR * 3) return null;

    const nFrames = Math.floor((samples.length - WIN) / HOP);
    const env = new Float32Array(nFrames);
    for (let f = 0; f < nFrames; f++) {
      const start = f * HOP;
      let s = 0;
      for (let j = 0; j < WIN; j++) {
        const v = samples[start + j];
        s += v * v;
      }
      env[f] = Math.sqrt(s / WIN);
    }
    return env;
  } catch {
    return null;
  }
}

/** Mediana RMS do miolo da faixa (corpo musical). */
export function bodyRms(env: Float32Array): number {
  const start = Math.floor(env.length * 0.12);
  const end = Math.floor(env.length * 0.78);
  if (end <= start) return 0;
  const slice = Array.from(env.subarray(start, end)).sort((a, b) => a - b);
  return slice[Math.floor(slice.length * 0.5)] ?? 0;
}

/**
 * Último frame considerado "música" — ignora cauda baixa/ruído longa no fim do arquivo.
 * Ex.: Lullaby (~27 s de rumble após o fim real).
 */
export function findContentEndIdx(env: Float32Array, body: number, maxIdx = env.length - 1): number {
  if (body <= 0) return maxIdx;

  const limit = Math.min(maxIdx, env.length - 1);
  const lowThresh = body * 0.17;
  const musicThresh = body * 0.26;
  const win = frames(1.5);

  let i = limit;
  while (i >= 0 && env[i] < lowThresh) i--;

  for (let j = Math.min(limit, i); j >= frames(4); j--) {
    const from = Math.max(0, j - win + 1);
    const slice = env.subarray(from, j + 1);
    if (median(slice) >= musicThresh) return j;
  }

  return Math.max(0, i);
}

function coeffVar(values: Float32Array): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let varSum = 0;
  for (const v of values) varSum += (v - mean) ** 2;
  return Math.sqrt(varSum / values.length) / (mean + 1e-9);
}

/** Platô baixo sustentado (outro quieto) — não confundir com fade que ainda cai. */
function endsInSustainedQuietPlateau(seg: Float32Array, body: number): boolean {
  const win = frames(8);
  if (seg.length < frames(14)) return false;

  const last = seg.subarray(seg.length - win);
  const prev = seg.subarray(seg.length - frames(16), seg.length - win);
  const lastMed = median(last);
  const prevMed = median(prev);

  if (lastMed < body * 0.12 || lastMed > body * 0.38) return false;
  if (prevMed < body * 0.12 || prevMed > body * 0.38) return false;
  if (Math.abs(lastMed - prevMed) > body * 0.08) return false;

  return coeffVar(last) < 0.28;
}

/** Silêncio plano absoluto no fim (dead air). */
function detectDeadAirTrimMs(env: Float32Array): number {
  const peak = Math.max(...env) || 1e-9;
  const flatThresh = peak * 0.014;
  const minFlatSec = 1.2;
  const n = env.length;

  let run = 0;
  let i = n - 1;
  while (i >= 0 && env[i] <= flatThresh) {
    run++;
    i--;
  }
  const flatSec = run * HOP_SEC;
  if (flatSec < minFlatSec) return 0;

  const tail = env.subarray(i + 1);
  if (tail.length < 2) return 0;
  const mean = tail.reduce((a, v) => a + v, 0) / tail.length;
  const variance = tail.reduce((a, v) => a + (v - mean) ** 2, 0) / tail.length;
  const cv = Math.sqrt(variance) / (mean + 1e-9);
  if (cv > 0.45) return 0;

  return Math.round(flatSec * 1000);
}

/**
 * Cauda baixa/ruído após o fim musical (≥1,2 s).
 * Diferente de silêncio morto — ainda há energia, mas muito abaixo do corpo.
 */
export function detectLowTailTrimMs(env: Float32Array, body: number, contentEndIdx: number): number {
  if (body <= 0) return 0;
  const tailFrames = env.length - 1 - contentEndIdx;
  if (tailFrames < frames(1.2)) return 0;

  const tail = env.subarray(contentEndIdx + 1);
  const tailMax = Math.max(...tail);
  const tailAvg = tail.reduce((a, v) => a + v, 0) / tail.length;

  if (tailMax > body * 0.38) return 0;
  if (tailAvg > body * 0.22) return 0;

  return Math.round(tailFrames * HOP_SEC * 1000);
}

export function detectTrimFimMs(env: Float32Array, body = bodyRms(env)): number {
  const contentEnd = findContentEndIdx(env, body);
  const lowTail = detectLowTailTrimMs(env, body, contentEnd);
  const deadAir = detectDeadAirTrimMs(env);
  return Math.max(lowTail, deadAir);
}

/**
 * Outro contínuo baixo (What's Up) — sem fade de rádio; mix = 0.
 * Analisa o fim real do arquivo (após trim), não o fim “musical”.
 */
export function isQuietOutroTail(env: Float32Array, body: number, trimFimMs = 0): boolean {
  if (body <= 0) return false;

  const trimFrames = Math.floor(trimFimMs / 1000 / HOP_SEC);
  const endIdx = Math.max(0, env.length - 1 - trimFrames);

  const tailLen = frames(22);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(4)) return false;

  const quietWin = Math.min(tail.length, frames(14));
  const quietSlice = tail.subarray(tail.length - quietWin);
  let qMax = 0;
  let qSum = 0;
  for (const v of quietSlice) {
    qMax = Math.max(qMax, v);
    qSum += v;
  }
  const qAvg = qSum / quietSlice.length;

  const midStart = Math.max(0, tail.length - frames(22));
  const midEnd = Math.max(0, tail.length - frames(10));
  const midSlice = tail.subarray(midStart, midEnd);
  const midMed = midSlice.length > 0 ? median(midSlice) : body;

  return (
    qMax >= body * 0.12 &&
    qMax < body * 0.34 &&
    qAvg < body * 0.22 &&
    midMed < body * 0.55 &&
    midMed > body * 0.12
  );
}

/** Fade clássico de rádio: platô alto → queda nos últimos segundos. */
function detectStrictRadioFade(env: Float32Array, body: number, contentEndIdx: number): number {
  const tailLen = frames(32);
  const tailStart = Math.max(0, contentEndIdx - tailLen);
  const tail = env.subarray(tailStart, contentEndIdx + 1);
  if (tail.length < frames(4)) return 0;

  const plateauMinFrames = frames(0.9);
  const fadeMinFrames = frames(1.4);
  const maxFadeStartFromEndFrames = frames(18);
  const minFadeStartIdx = Math.max(3, tail.length - 1 - maxFadeStartFromEndFrames);

  let bestMix = 0;
  let bestScore = 0;

  for (let fadeStart = tail.length - 2; fadeStart >= minFadeStartIdx; fadeStart--) {
    const ref = tail[fadeStart];
    if (ref < body * 0.28) continue;

    let plateauStart = fadeStart;
    while (
      plateauStart > 0 &&
      tail[plateauStart - 1] >= ref * 0.82 &&
      tail[plateauStart - 1] <= ref * 1.18
    ) {
      plateauStart--;
    }
    if (fadeStart - plateauStart < plateauMinFrames) continue;

    const fadeSeg = tail.subarray(fadeStart);
    if (fadeSeg.length < fadeMinFrames) continue;

    let dec = 0;
    for (let j = 1; j < fadeSeg.length; j++) {
      if (fadeSeg[j] <= fadeSeg[j - 1] * 1.06) dec++;
    }
    const decRatio = dec / (fadeSeg.length - 1);
    if (decRatio < 0.38) continue;
    const endRatio = fadeSeg[fadeSeg.length - 1] / ref;
    if (endRatio > 0.55) continue;
    if (endRatio > 0.34 && decRatio < 0.52) continue;

    const fadeFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    if (fadeFromEndSec > 14) continue;
    const mix = Math.max(1, Math.round(fadeFromEndSec - 2));
    if (mix > 22) continue;

    const score = decRatio * (ref / body) * Math.min(1, (fadeStart - plateauStart) / plateauMinFrames);
    if (score > bestScore) {
      bestScore = score;
      bestMix = mix;
    }
  }

  return bestMix;
}

/** Fade suave (jazz/voz) — queda progressiva sem platô rígido. */
function detectSoftFadeMix(env: Float32Array, body: number, contentEndIdx: number): number {
  const tailLen = frames(22);
  const tailStart = Math.max(0, contentEndIdx - tailLen);
  const tail = env.subarray(tailStart, contentEndIdx + 1);
  if (tail.length < frames(5)) return 0;

  const peakIdx = tail.reduce((best, v, idx) => (v > tail[best] ? idx : best), 0);
  const peak = tail[peakIdx];
  if (peak < body * 0.24) return 0;

  const minDrop = 0.35;
  const minFadeFrames = frames(2.2);
  let fadeStart = -1;

  for (let i = peakIdx + 1; i < tail.length - frames(1); i++) {
    const seg = tail.subarray(i);
    if (seg.length < minFadeFrames) break;
    const endVal = seg[seg.length - 1];
    if (endVal > peak * (1 - minDrop)) continue;

    let dec = 0;
    for (let j = 1; j < seg.length; j++) {
      if (seg[j] <= seg[j - 1] * 1.08) dec++;
    }
    if (dec / (seg.length - 1) < 0.35) continue;
    if (endsInSustainedQuietPlateau(seg, body)) continue;

    fadeStart = i;
    break;
  }

  if (fadeStart < 0) return 0;

  const fadeSeg = tail.subarray(fadeStart);
  if (endsInSustainedQuietPlateau(fadeSeg, body)) return 0;

  const fadeFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
  if (fadeFromEndSec > 14) return 0;
  const mix = Math.max(1, Math.round(fadeFromEndSec - 2));
  return mix <= 22 ? mix : 0;
}

/**
 * Ponto de mix: 2 s depois do início do fade de rádio (platô → queda).
 */
export function detectMixSegundos(
  env: Float32Array,
  trimFimMs: number,
  body = bodyRms(env),
): number {
  if (body <= 0) return 0;

  const trimFrames = Math.floor(trimFimMs / 1000 / HOP_SEC);
  const endIdx = Math.max(0, env.length - 1 - trimFrames);
  const contentEnd = Math.min(endIdx, findContentEndIdx(env, body, endIdx));

  if (isQuietOutroTail(env, body, trimFimMs)) return 0;

  const strict = detectStrictRadioFade(env, body, contentEnd);
  if (strict > 0) return strict;

  return detectSoftFadeMix(env, body, contentEnd);
}

/** Analisa ponto de mix e trim final (sem tocar no início). */
export async function detectMixAndTrim(inputPath: string): Promise<MixTrimResult> {
  const env = await loadEnvelope(inputPath);
  if (!env) {
    return { mixSegundosFinais: 0, trimFimMs: 0, trimInicioMs: 0, quietOutro: false, envelopeOk: false };
  }

  const body = bodyRms(env);
  const trimFimMs = detectTrimFimMs(env, body);
  const trimFrames = Math.floor(trimFimMs / 1000 / HOP_SEC);
  const analysisEnd = Math.max(0, env.length - 1 - trimFrames);
  const contentEnd = Math.min(findContentEndIdx(env, body), analysisEnd);
  const quietOutro = isQuietOutroTail(env, body, trimFimMs);
  const mixSegundosFinais = quietOutro ? 0 : detectMixSegundos(env, trimFimMs, body);

  return { mixSegundosFinais, trimFimMs, trimInicioMs: 0, quietOutro, envelopeOk: true };
}

/** @deprecated Use detectMixAndTrim — mantido para compat. */
export async function detectMixSegundosFinais(inputPath: string): Promise<number> {
  const r = await detectMixAndTrim(inputPath);
  return r.mixSegundosFinais;
}
