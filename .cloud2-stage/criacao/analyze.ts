import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

export interface LocalAnalysis {
  bpm: number | null;
  /** 0..1 — proxy de energia a partir do RMS global. */
  energia: number | null;
}

const SR = 11025;
const HOP = 128;
const WIN = 256;

/**
 * Análise local autossuficiente (sem Essentia): decodifica o áudio com ffmpeg para
 * PCM mono 11025 Hz e estima BPM (fluxo de onsets + autocorrelação) e energia (RMS).
 * Best-effort: retorna null em qualquer falha, sem derrubar o pipeline.
 */
export async function analyzeAudio(filePath: string): Promise<LocalAnalysis> {
  let samples: Float32Array;
  try {
    const { stdout } = await pexec(
      'ffmpeg',
      ['-v', 'quiet', '-i', filePath, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
      { maxBuffer: 128 * 1024 * 1024, encoding: 'buffer' } as Parameters<typeof pexec>[2],
    );
    const buf = stdout as unknown as Buffer;
    samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  } catch {
    return { bpm: null, energia: null };
  }
  if (samples.length < SR) return { bpm: null, energia: null };

  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  const rms = Math.sqrt(sumSq / samples.length);
  const db = rms > 1e-7 ? 20 * Math.log10(rms) : -90;
  const energia = Math.min(1, Math.max(0, (db + 30) / 24));

  const nFrames = Math.floor((samples.length - WIN) / HOP);
  if (nFrames < 8) return { bpm: null, energia };

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

  const onset = new Float32Array(nFrames);
  let mean = 0;
  for (let f = 1; f < nFrames; f++) {
    const d = env[f] - env[f - 1];
    onset[f] = d > 0 ? d : 0;
    mean += onset[f];
  }
  mean /= nFrames;
  for (let f = 0; f < nFrames; f++) onset[f] -= mean;

  const fps = SR / HOP;
  const lagMin = Math.floor((fps * 60) / 180);
  const lagMax = Math.ceil((fps * 60) / 60);
  let bestLag = 0;
  let bestVal = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let acc = 0;
    for (let f = lag; f < nFrames; f++) acc += onset[f] * onset[f - lag];
    if (acc > bestVal) {
      bestVal = acc;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || !Number.isFinite(bestVal) || bestVal <= 0) return { bpm: null, energia };

  let bpm = (fps * 60) / bestLag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  return { bpm: Math.round(bpm), energia: Number(energia.toFixed(3)) };
}
