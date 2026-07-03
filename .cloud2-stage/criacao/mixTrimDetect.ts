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

  const headLen = Math.max(1, Math.floor(tail.length * 0.35));
  const headMed = median(tail.subarray(0, headLen));
  const last60 = tail.subarray(Math.floor(tail.length * 0.4));
  if (last60.length >= frames(3)) {
    const dropLast = last60[0] > 0 ? 1 - last60[last60.length - 1] / last60[0] : 0;
    const cvSecondHalf = coeffVar(last60.subarray(Math.floor(last60.length * 0.45)));
    /** Fade contínuo no fim (samba/MPB) — não outro quieto plano. */
    if (dropLast > 0.1 && cvSecondHalf > 0.07 && headMed > body * 0.25) return false;
  }

  return (
    qMax >= body * 0.12 &&
    qMax < body * 0.34 &&
    qAvg < body * 0.22 &&
    midMed < body * 0.55 &&
    midMed > body * 0.12
  );
}

type FadeCandidate = {
  /** Segundos do fim útil até o início do fade. */
  startFromEndSec: number;
  score: number;
};

/**
 * Ponto de mix no meio do fade final (não no início brusco).
 * Ex.: fade de 10 s → mix ≈ 5 s finais (2.ª metade do fade).
 */
function mixFromFadeStart(startFromEndSec: number): number {
  if (startFromEndSec < 1.2) return 0;
  const mid = startFromEndSec * 0.5;
  return Math.max(1, Math.min(22, Math.round(mid)));
}

/** Rejeita falso fade quando ainda há clímax/subida depois do corte. */
function isClimaxStillBuilding(fadeSeg: Float32Array): boolean {
  if (fadeSeg.length < frames(2)) return true;

  const ref = fadeSeg[0];
  const scan = Math.min(
    fadeSeg.length,
    Math.max(frames(10), Math.floor(fadeSeg.length * 0.42)),
  );
  let peak = ref;
  let peakIdx = 0;
  for (let i = 1; i < scan; i++) {
    if (fadeSeg[i] > peak) {
      peak = fadeSeg[i];
      peakIdx = i;
    }
  }

  // Pico relevante depois do início → ainda está subindo (ex. Sunday Morning).
  if (peakIdx >= frames(1.2) && peak > ref * 1.06) return true;

  const early = Math.max(1, Math.floor(fadeSeg.length * 0.38));
  if (fadeSeg[early] > ref * 1.05) return true;

  // Queda real do pico local até o fim.
  if (peak > ref * 1.03 && fadeSeg[fadeSeg.length - 1] > peak * 0.8) return true;

  return false;
}

function netFadeDrop(fadeSeg: Float32Array): number {
  const ref = fadeSeg[0];
  if (ref <= 0) return 0;
  return 1 - fadeSeg[fadeSeg.length - 1] / ref;
}

function monotonicDropRatio(fadeSeg: Float32Array, slack: number): number {
  let dec = 0;
  for (let j = 1; j < fadeSeg.length; j++) {
    if (fadeSeg[j] <= fadeSeg[j - 1] * slack) dec++;
  }
  return fadeSeg.length > 1 ? dec / (fadeSeg.length - 1) : 0;
}

/** Fração do segmento em patamar alto/plano (corpo antes do fade — não é fade gradual). */
function flatHighPrefixRatio(fadeSeg: Float32Array, body: number): number {
  if (fadeSeg.length < 3) return 0;
  const tol = body * 0.045;
  let flat = 0;
  for (let i = 0; i < fadeSeg.length - 1; i++) {
    if (fadeSeg[i] > body * 0.72 && Math.abs(fadeSeg[i] - fadeSeg[i + 1]) < tol) flat++;
  }
  return flat / (fadeSeg.length - 1);
}

function detectStrictRadioFade(env: Float32Array, body: number, endIdx: number): FadeCandidate | null {
  const tailLen = frames(14);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(4)) return null;

  const plateauMinFrames = frames(0.9);
  const fadeMinFrames = frames(1.4);
  const maxFadeStartFromEndFrames = frames(20);
  const minFadeStartIdx = Math.max(3, tail.length - 1 - maxFadeStartFromEndFrames);

  let best: FadeCandidate | null = null;

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
    if (isClimaxStillBuilding(fadeSeg)) continue;

    const decRatio = monotonicDropRatio(fadeSeg, 1.06);
    if (decRatio < 0.35) continue;
    const endRatio = fadeSeg[fadeSeg.length - 1] / ref;
    if (endRatio > 0.58) continue;

    const startFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    if (startFromEndSec > 12) continue;

    const score = decRatio * (ref / body) * Math.min(1, (fadeStart - plateauStart) / plateauMinFrames);
    if (!best || score > best.score) {
      best = { startFromEndSec, score };
    }
  }

  return best;
}

/** Fade suave longo (Seasons, Paloma Negra) — queda progressiva no fim real da música. */
function detectSoftFadeMix(env: Float32Array, body: number, endIdx: number): FadeCandidate | null {
  const tailLen = frames(20);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(4)) return null;

  const minDrop = 0.22;
  const minFadeFrames = frames(1.5);
  let best: FadeCandidate | null = null;

  for (let fadeStart = tail.length - 2; fadeStart >= frames(2); fadeStart--) {
    const ref = tail[fadeStart];
    if (ref < body * 0.14) continue;

    const fadeSeg = tail.subarray(fadeStart);
    if (fadeSeg.length < minFadeFrames) continue;
    if (isClimaxStillBuilding(fadeSeg)) continue;

    const endVal = fadeSeg[fadeSeg.length - 1];
    if (endVal > ref * (1 - minDrop)) continue;

    const decRatio = monotonicDropRatio(fadeSeg, 1.09);
    if (decRatio < 0.32) continue;
    if (endsInSustainedQuietPlateau(fadeSeg, body)) continue;

    const startFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    if (startFromEndSec > 20) continue;

    const score = netFadeDrop(fadeSeg) * decRatio * (ref / body);
    if (!best || score > best.score) {
      best = { startFromEndSec, score };
    }
  }

  return best;
}

function lastLocalPeakIdx(tail: Float32Array, body: number, minIdx: number): number {
  for (let i = tail.length - 2; i >= minIdx + 1; i--) {
    const v = tail[i];
    if (v < body * 0.22) continue;
    // Pico estrito ou início visível de descida (ignora patamares planos).
    if (v > tail[i - 1] * 1.015 && v >= tail[i + 1] * 0.985) return i;
    if (v >= tail[i - 1] * 0.985 && v > tail[i + 1] * 1.025) return i;
  }
  return -1;
}

/**
 * Fade após o último pico local (clímax → descida).
 * Evita antecipar mix no meio de subida (Sunday Morning) e encontra fades longos graduais.
 */
function detectPeakThenFadeMix(env: Float32Array, body: number, endIdx: number): FadeCandidate | null {
  const tailLen = frames(24);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(4)) return null;

  const minPeakIdx = Math.max(1, tail.length - frames(18));
  const peakIdx = lastLocalPeakIdx(tail, body, minPeakIdx);
  if (peakIdx < 0) return null;

  const peak = tail[peakIdx];
  let best: FadeCandidate | null = null;

  for (let fadeStart = peakIdx; fadeStart <= tail.length - frames(1.2); fadeStart++) {
    const fadeSeg = tail.subarray(fadeStart);
    if (fadeSeg.length < frames(1.2)) continue;
    if (isClimaxStillBuilding(fadeSeg)) continue;
    if (endsInSustainedQuietPlateau(fadeSeg, body)) continue;

    const drop = netFadeDrop(fadeSeg);
    if (drop < 0.12) continue;
    if (fadeSeg[fadeSeg.length - 1] > peak * 0.75) continue;

    const decRatio = monotonicDropRatio(fadeSeg, 1.12);
    if (decRatio < 0.24) continue;

    const peakFromEndSec = (tail.length - 1 - peakIdx) * HOP_SEC;
    if (peakFromEndSec > 16) continue;

    const score = drop * decRatio * Math.sqrt(fadeSeg.length) * (peak / body);
    if (!best || score > best.score) {
      best = { startFromEndSec: peakFromEndSec, score };
    }
  }

  return best;
}

/**
 * Fade longo e gradual (Harvest Moon, Be My Man): queda suave com micro-ondulações.
 * Prefere o fade mais longo válido no fim — mix = metade dessa duração.
 */
function detectGradualLongFadeMix(env: Float32Array, body: number, endIdx: number): FadeCandidate | null {
  const tailLen = frames(26);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < frames(8)) return null;

  let best: FadeCandidate | null = null;

  for (let fadeStart = tail.length - frames(2); fadeStart >= frames(6); fadeStart--) {
    const fadeSeg = tail.subarray(fadeStart);
    const startFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    if (startFromEndSec < 6 || startFromEndSec > 20) continue;

    const ref = fadeSeg[0];
    if (ref < body * 0.11) continue;
    if (isClimaxStillBuilding(fadeSeg)) continue;
    if (endsInSustainedQuietPlateau(fadeSeg, body)) continue;

    const drop = netFadeDrop(fadeSeg);
    if (drop < 0.18) continue;
    if (fadeSeg[fadeSeg.length - 1] > ref * 0.8) continue;

    const decRatio = monotonicDropRatio(fadeSeg, 1.17);
    if (decRatio < 0.16) continue;

    if (flatHighPrefixRatio(fadeSeg, body) > 0.32) continue;

    let headMax = ref;
    const headLen = Math.min(fadeSeg.length, frames(2.5));
    for (let i = 0; i < headLen; i++) headMax = Math.max(headMax, fadeSeg[i]);
    if (ref < headMax * 0.86) continue;

    const score = drop * decRatio * startFromEndSec;
    if (!best || startFromEndSec > best.startFromEndSec) {
      best = { startFromEndSec, score };
    }
  }

  return best;
}

function pickBestFadeCandidate(input: {
  peak: FadeCandidate | null;
  gradual: FadeCandidate | null;
  soft: FadeCandidate | null;
  strict: FadeCandidate | null;
}): number {
  const { peak, gradual, soft, strict } = input;

  // Fade longo gradual — Harvest (~18 s → mix 9), Be My Man (~16 s → mix 8).
  if (gradual && gradual.startFromEndSec >= 8) {
    return mixFromFadeStart(gradual.startFromEndSec);
  }

  // Clímax + fade curto — Sunday (não usar strict com 18 s).
  if (peak && peak.startFromEndSec <= 12) {
    const mixPeak = mixFromFadeStart(peak.startFromEndSec);
    if (mixPeak >= 2) return mixPeak;
  }

  if (soft) {
    const mixSoft = mixFromFadeStart(soft.startFromEndSec);
    if (mixSoft > 0) return mixSoft;
  }

  if (strict && strict.startFromEndSec <= 10) {
    return mixFromFadeStart(strict.startFromEndSec);
  }

  if (gradual) return mixFromFadeStart(gradual.startFromEndSec);
  if (peak) return mixFromFadeStart(peak.startFromEndSec);
  return 0;
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

  return pickBestFadeCandidate({
    peak: detectPeakThenFadeMix(env, body, musicalEnd),
    gradual: detectGradualLongFadeMix(env, body, musicalEnd),
    soft: detectSoftFadeMix(env, body, musicalEnd),
    strict: detectStrictRadioFade(env, body, musicalEnd),
  });
}

/** Analisa só ponto de mix (fade). Trim é manual na Edição de música. */
export async function detectMixAndTrim(inputPath: string): Promise<MixTrimResult> {
  const env = await loadEnvelope(inputPath);
  if (!env) {
    return { mixSegundosFinais: 0, trimFimMs: 0, trimInicioMs: 0, quietOutro: false, envelopeOk: false };
  }

  const body = bodyRms(env);
  const mixSegundosFinais = detectMixSegundos(env, 0, body);
  const quietOutro = mixSegundosFinais === 0 && isQuietOutroTail(env, body, 0);

  return { mixSegundosFinais, trimFimMs: 0, trimInicioMs: 0, quietOutro, envelopeOk: true };
}

export async function detectMixSegundosFinais(inputPath: string): Promise<number> {
  const r = await detectMixAndTrim(inputPath);
  return r.mixSegundosFinais;
}
