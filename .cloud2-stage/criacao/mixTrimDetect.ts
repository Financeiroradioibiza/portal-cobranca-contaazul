import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** Janelas de ~100 ms para análise do final da faixa. */
const SR = 11025;
const WIN = 1102;
const HOP = 1102;
const HOP_SEC = HOP / SR;

export type MixTrimResult = {
  /** Segundos finais onde começa o crossfade (0 = sem ponto de mix). */
  mixSegundosFinais: number;
  /** Corta silêncio morto após fim abrupto (ms). Início nunca é alterado automaticamente. */
  trimFimMs: number;
  trimInicioMs: 0;
};

/** Decodifica mono PCM para envelope RMS. */
async function loadEnvelope(inputPath: string): Promise<Float32Array | null> {
  try {
    const { stdout } = await pexec(
      'ffmpeg',
      ['-v', 'quiet', '-i', inputPath, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
      { maxBuffer: 128 * 1024 * 1024, encoding: 'buffer' } as Parameters<typeof pexec>[2],
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
 * Trim só no fim: silêncio plano por ≥1,2 s após o fim da música (ex.: arquivo com dead air).
 * Não corta fade natural que termina no zero do arquivo.
 */
export function detectTrimFimMs(env: Float32Array): number {
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
  if (cv > 0.4) return 0;

  return Math.round(flatSec * 1000);
}

/**
 * Ponto de mix: 2 s depois do início de um fade de rádio (platô alto → queda).
 * Quiet outro contínuo (violão/voz baixa no fim, ex. What's Up) → 0.
 */
export function detectMixSegundos(env: Float32Array, trimFimMs: number): number {
  const body = bodyRms(env);
  if (body <= 0) return 0;

  const trimFrames = Math.floor(trimFimMs / 1000 / HOP_SEC);
  const endIdx = Math.max(0, env.length - 1 - trimFrames);
  const tailLen = Math.floor(24 / HOP_SEC);
  const tailStart = Math.max(0, endIdx - tailLen);
  const tail = env.subarray(tailStart, endIdx + 1);
  if (tail.length < Math.floor(4 / HOP_SEC)) return 0;

  const quietWin = Math.min(tail.length, Math.floor(20 / HOP_SEC));
  const quietSlice = tail.subarray(tail.length - quietWin);
  let qMax = 0;
  let qSum = 0;
  for (const v of quietSlice) {
    qMax = Math.max(qMax, v);
    qSum += v;
  }
  const qAvg = qSum / quietSlice.length;
  if (qMax < body * 0.4 && qAvg < body * 0.26) return 0;

  const plateauMinFrames = Math.floor(1.6 / HOP_SEC);
  const fadeMinFrames = Math.floor(2.5 / HOP_SEC);
  /** Fade de rádio costuma começar nos últimos ~14 s (não outro longo de 30 s). */
  const maxFadeStartFromEndFrames = Math.floor(14 / HOP_SEC);
  const minFadeStartIdx = Math.max(3, tail.length - 1 - maxFadeStartFromEndFrames);

  let bestMix = 0;
  let bestScore = 0;

  for (let fadeStart = tail.length - 2; fadeStart >= minFadeStartIdx; fadeStart--) {
    const ref = tail[fadeStart];
    if (ref < body * 0.46) continue;

    let plateauStart = fadeStart;
    while (
      plateauStart > 0 &&
      tail[plateauStart - 1] >= ref * 0.87 &&
      tail[plateauStart - 1] <= ref * 1.13
    ) {
      plateauStart--;
    }
    if (fadeStart - plateauStart < plateauMinFrames) continue;

    const fadeSeg = tail.subarray(fadeStart);
    if (fadeSeg.length < fadeMinFrames) continue;

    let dec = 0;
    for (let j = 1; j < fadeSeg.length; j++) {
      if (fadeSeg[j] <= fadeSeg[j - 1] * 1.04) dec++;
    }
    const decRatio = dec / (fadeSeg.length - 1);
    if (decRatio < 0.58) continue;
    if (fadeSeg[fadeSeg.length - 1] > ref * 0.34) continue;

    const fadeFromEndSec = (tail.length - 1 - fadeStart) * HOP_SEC;
    const mix = Math.round(fadeFromEndSec - 2);
    if (mix < 3 || mix > 22) continue;

    const score = decRatio * (ref / body) * Math.min(1, (fadeStart - plateauStart) / plateauMinFrames);
    if (score > bestScore) {
      bestScore = score;
      bestMix = mix;
    }
  }

  return bestMix;
}

/** Analisa ponto de mix e trim final (sem tocar no início). */
export async function detectMixAndTrim(inputPath: string): Promise<MixTrimResult> {
  const env = await loadEnvelope(inputPath);
  if (!env) {
    return { mixSegundosFinais: 0, trimFimMs: 0, trimInicioMs: 0 };
  }

  const trimFimMs = detectTrimFimMs(env);
  const mixSegundosFinais = detectMixSegundos(env, trimFimMs);

  return { mixSegundosFinais, trimFimMs, trimInicioMs: 0 };
}

/** @deprecated Use detectMixAndTrim — mantido para compat. */
export async function detectMixSegundosFinais(inputPath: string): Promise<number> {
  const r = await detectMixAndTrim(inputPath);
  return r.mixSegundosFinais;
}
