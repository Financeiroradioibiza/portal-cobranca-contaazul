import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** Janelas de ~100 ms para análise do final da faixa. */
const SR = 11025;
const WIN = 1102;
const HOP = 1102;
export const HOP_SEC = HOP / SR;

export type MixTrimResult = {
  mixSegundosFinais: number;
  trimFimMs: number;
  trimInicioMs: 0;
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

export function bodyRms(env: Float32Array): number {
  const start = Math.floor(env.length * 0.12);
  const end = Math.floor(env.length * 0.78);
  if (end <= start) return 0;
  const slice = Array.from(env.subarray(start, end)).sort((a, b) => a - b);
  return slice[Math.floor(slice.length * 0.5)] ?? 0;
}

/** Trim automático desativado — ajuste manual na Edição de música. */
export function detectTrimFimMs(_env: Float32Array, _body?: number): number {
  return 0;
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

/** Último trecho com energia musical (corpo ou fade) — ignora rumble/silêncio no fim. */
function findMusicalEndIdx(env: Float32Array, body: number, maxIdx = env.length - 1): number {
  const musicLevel = body * 0.17;
  const win = frames(1.2);
  const limit = Math.min(maxIdx, env.length - 1);

  for (let j = limit; j >= frames(3); j--) {
    const from = Math.max(0, j - win + 1);
    if (median(env.subarray(from, j + 1)) >= musicLevel) return j;
  }
  return limit;
}

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

function generousMixFromFade(fadeFromEndSec: number): number {
  if (fadeFromEndSec < 1.2) return 0;
  return Math.max(1, Math.min(22, Math.round(fadeFromEndSec)));
}

function detectStrictRadioFade(env: Float32Array, body: number, endIdx: number): number {
  const tailLen = frames(14);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(4)) return 0;

  const plateauMinFrames = frames(0.9);
  const fadeMinFrames = frames(1.4);
  const maxFadeStartFromEndFrames = frames(20);
  const minFadeStartIdx = Math.max(3, tail.length - 1 - maxFadeStartFromEndFrames);

  let bestMix = 0;
  let bestScore = 0;

  for (let fadeStart = tail.length - 2; fadeStart >= minFadeStartIdx; fadeStart--) {
    const ref = tail[fadeStart];
    if (ref < body * 0.22) continue;

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
    if (decRatio < 0.35) continue;
    const endRatio = fadeSeg[fadeSeg.length - 1] / ref;
    if (endRatio > 0.58) continue;

    const fadeFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    if (fadeFromEndSec > 20) continue;
    const mix = generousMixFromFade(fadeFromEndSec);
    if (mix <= 0) continue;

    const score = decRatio * (ref / body) * Math.min(1, (fadeStart - plateauStart) / plateauMinFrames);
    if (score > bestScore) {
      bestScore = score;
      bestMix = mix;
    }
  }

  return bestMix;
}

/** Fade suave longo (Seasons, Paloma Negra) — queda progressiva no fim real da música. */
function detectSoftFadeMix(env: Float32Array, body: number, endIdx: number): number {
  const tailLen = frames(20);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(4)) return 0;

  const minDrop = 0.22;
  const minFadeFrames = frames(1.5);
  let bestMix = 0;

  for (let fadeStart = tail.length - 2; fadeStart >= frames(2); fadeStart--) {
    const ref = tail[fadeStart];
    if (ref < body * 0.14) continue;

    const fadeSeg = tail.subarray(fadeStart);
    if (fadeSeg.length < minFadeFrames) continue;

    const endVal = fadeSeg[fadeSeg.length - 1];
    if (endVal > ref * (1 - minDrop)) continue;

    let dec = 0;
    for (let j = 1; j < fadeSeg.length; j++) {
      if (fadeSeg[j] <= fadeSeg[j - 1] * 1.09) dec++;
    }
    if (dec / (fadeSeg.length - 1) < 0.32) continue;
    if (endsInSustainedQuietPlateau(fadeSeg, body)) continue;

    const fadeFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    if (fadeFromEndSec > 20) continue;
    const mix = generousMixFromFade(fadeFromEndSec);
    if (mix > bestMix) bestMix = mix;
  }

  return bestMix;
}

export function detectMixSegundos(
  env: Float32Array,
  trimFimMs: number,
  body = bodyRms(env),
): number {
  if (body <= 0) return 0;

  const trimFrames = Math.floor(trimFimMs / 1000 / HOP_SEC);
  const endIdx = Math.max(0, env.length - 1 - trimFrames);
  const musicalEnd = findMusicalEndIdx(env, body, endIdx);

  if (isQuietOutroTail(env, body, trimFimMs)) return 0;

  const strict = detectStrictRadioFade(env, body, musicalEnd);
  if (strict > 0) return strict;

  return detectSoftFadeMix(env, body, musicalEnd);
}

/** Analisa só ponto de mix (fade). Trim é manual na Edição de música. */
export async function detectMixAndTrim(inputPath: string): Promise<MixTrimResult> {
  const env = await loadEnvelope(inputPath);
  if (!env) {
    return { mixSegundosFinais: 0, trimFimMs: 0, trimInicioMs: 0, quietOutro: false, envelopeOk: false };
  }

  const body = bodyRms(env);
  const quietOutro = isQuietOutroTail(env, body, 0);
  const mixSegundosFinais = quietOutro ? 0 : detectMixSegundos(env, 0, body);

  return { mixSegundosFinais, trimFimMs: 0, trimInicioMs: 0, quietOutro, envelopeOk: true };
}

export async function detectMixSegundosFinais(inputPath: string): Promise<number> {
  const r = await detectMixAndTrim(inputPath);
  return r.mixSegundosFinais;
}
