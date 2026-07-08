import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { criacaoConfig } from './config.js';

export type LoudnormMeasured = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

export type ProduceOutput = {
  masterPath: string;
  uso128Path: string;
  durationMs: number;
  loudnessLufs: number;
  truePeakDb: number;
  masterSizeBytes: number;
  usoSizeBytes: number;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    proc.stderr?.on('data', (d) => {
      err += String(d);
    });
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `ffmpeg exit ${code}`));
    });
  });
}

function parseLoudnormJson(stderrOrStdout: string): LoudnormMeasured | null {
  const start = stderrOrStdout.indexOf('{');
  const end = stderrOrStdout.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(stderrOrStdout.slice(start, end + 1)) as Record<string, unknown>;
    const input = (j.input_i != null ? j : (j as { input?: Record<string, unknown> }).input) as Record<
      string,
      unknown
    >;
    if (!input?.input_i) return null;
    return {
      input_i: String(input.input_i),
      input_tp: String(input.input_tp ?? '0'),
      input_lra: String(input.input_lra ?? criacaoConfig.targetLra),
      input_thresh: String(input.input_thresh ?? '-70'),
      target_offset: String(input.target_offset ?? '0'),
    };
  } catch {
    return null;
  }
}

async function measureLoudnorm(inputPath: string): Promise<LoudnormMeasured> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      inputPath,
      '-af',
      `loudnorm=I=${criacaoConfig.targetLufs}:TP=${criacaoConfig.targetTruePeak}:LRA=${criacaoConfig.targetLra}:print_format=json`,
      '-f',
      'null',
      '-',
    ];
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-y', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let combined = '';
    proc.stderr?.on('data', (d) => {
      combined += String(d);
    });
    proc.stdout?.on('data', (d) => {
      combined += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const measured = parseLoudnormJson(combined);
      if (measured) {
        resolve(measured);
        return;
      }
      if (code === 0) reject(new Error('loudnorm_measure_parse_failed'));
      else reject(new Error(combined.trim() || `ffmpeg measure exit ${code}`));
    });
  });
}

async function probeDurationMs(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    proc.stdout?.on('data', (d) => {
      out += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(0);
        return;
      }
      const sec = parseFloat(out.trim());
      resolve(Number.isFinite(sec) ? Math.round(sec * 1000) : 0);
    });
  });
}

function normalizeIsrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/-/g, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s)) return null;
  return s;
}

/** ISRC de tags ID3 (TSRC/ISRC) ou null se indisponível. */
export async function probeIsrcFromFile(inputPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    proc.stdout?.on('data', (d) => {
      out += String(d);
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      try {
        const j = JSON.parse(out) as {
          format?: { tags?: Record<string, string> };
          streams?: { tags?: Record<string, string> }[];
        };
        const tags = { ...(j.format?.tags ?? {}), ...(j.streams?.[0]?.tags ?? {}) };
        for (const key of ['ISRC', 'isrc', 'TSRC', 'tsrc']) {
          const hit = normalizeIsrc(tags[key]);
          if (hit) {
            resolve(hit);
            return;
          }
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** BPM de tags ID3 ou null se indisponível. */
export async function probeBpmFromFile(inputPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format_tags=TBPM',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    proc.stdout?.on('data', (d) => {
      out += String(d);
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) && n > 40 && n < 260 ? Math.round(n) : null);
    });
  });
}

/**
 * Normaliza LUFS (two-pass loudnorm) e gera:
 * - master MP3 192k (stereo)
 * - versão de uso MP3 128k mono
 */
export async function produceMasterAndUso(inputPath: string, workDir: string): Promise<ProduceOutput> {
  await fsp.mkdir(workDir, { recursive: true });
  const measured = await measureLoudnorm(inputPath);
  const normWav = path.join(workDir, 'normalized.wav');
  const masterPath = path.join(workDir, 'master_192.mp3');
  const uso128Path = path.join(workDir, 'uso_128_mono.mp3');

  const loudnormApply =
    `loudnorm=I=${criacaoConfig.targetLufs}:TP=${criacaoConfig.targetTruePeak}:LRA=${criacaoConfig.targetLra}` +
    `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`;

  await runFfmpeg(['-i', inputPath, '-af', loudnormApply, normWav]);

  await runFfmpeg(['-i', normWav, '-codec:a', 'libmp3lame', '-b:a', '192k', masterPath]);
  await runFfmpeg(['-i', normWav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '128k', uso128Path]);

  const durationMs = await probeDurationMs(uso128Path);
  const loudnessLufs = parseFloat(measured.input_i);
  const truePeakDb = parseFloat(measured.input_tp);
  const masterSizeBytes = (await fsp.stat(masterPath)).size;
  const usoSizeBytes = (await fsp.stat(uso128Path)).size;

  return {
    masterPath,
    uso128Path,
    durationMs,
    loudnessLufs: Number.isFinite(loudnessLufs) ? loudnessLufs : criacaoConfig.targetLufs,
    truePeakDb: Number.isFinite(truePeakDb) ? truePeakDb : criacaoConfig.targetTruePeak,
    masterSizeBytes,
    usoSizeBytes,
  };
}

/**
 * Gera MP3 128k mono a partir de áudio já normalizado (master/uso), aplicando trim.
 * Não re-aplica loudnorm — o master já passou pelo pipeline de programação.
 */
export async function encodeTrimmedUso128Mono(
  inputPath: string,
  outputPath: string,
  trimInicioMs: number,
  trimFimMs: number,
): Promise<{ durationMs: number }> {
  const totalMs = await probeDurationMs(inputPath);
  const startSec = Math.max(0, trimInicioMs / 1000);
  const endSec = Math.max(startSec + 0.1, (totalMs - trimFimMs) / 1000);
  const durationSec = Math.max(0.1, endSec - startSec);

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg([
    '-ss',
    String(startSec),
    '-i',
    inputPath,
    '-t',
    String(durationSec),
    '-ac',
    '1',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '128k',
    outputPath,
  ]);

  const durationMs = await probeDurationMs(outputPath);
  return { durationMs };
}

/** Normaliza vinheta (LUFS) e grava MP3 128k mono — alinhado ao target da programação. */
export async function produceVinhetaMp3(inputPath: string, outputPath: string): Promise<{ durationMs: number }> {
  const workDir = path.join(path.dirname(outputPath), 'work-vinheta');
  await fsp.mkdir(workDir, { recursive: true });
  const measured = await measureLoudnorm(inputPath);
  const normWav = path.join(workDir, 'normalized.wav');

  const loudnormApply =
    `loudnorm=I=${criacaoConfig.targetLufs}:TP=${criacaoConfig.targetTruePeak}:LRA=${criacaoConfig.targetLra}` +
    `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}` +
    `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`;

  await runFfmpeg(['-i', inputPath, '-af', loudnormApply, normWav]);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await runFfmpeg(['-i', normWav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '128k', outputPath]);

  const durationMs = await probeDurationMs(outputPath);
  await fsp.rm(workDir, { recursive: true, force: true }).catch(() => null);
  return { durationMs };
}

/** Locução ElevenLabs + trilha ambiente — voz em destaque, bed mais baixo, corte seco no fim (sem fade / ponto de mix). */
export async function mixVinhetaVoiceWithBed(
  voicePath: string,
  bedPath: string,
  outputPath: string,
  opts?: { bedVolume?: number },
): Promise<{ durationMs: number }> {
  const bedVol = opts?.bedVolume ?? 0.18;
  const workDir = path.join(path.dirname(outputPath), 'work-vinheta-ia');
  await fsp.mkdir(workDir, { recursive: true });
  const mixedRaw = path.join(workDir, 'mixed-raw.mp3');
  await runFfmpeg([
    '-i',
    voicePath,
    '-i',
    bedPath,
    '-filter_complex',
    `[1:a]volume=${bedVol.toFixed(4)}[bed];` +
      `[0:a][bed]amix=inputs=2:duration=first:dropout_transition=2,volume=1.08`,
    '-ac',
    '1',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '192k',
    mixedRaw,
  ]);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const result = await produceVinhetaMp3(mixedRaw, outputPath);
  await fsp.rm(workDir, { recursive: true, force: true }).catch(() => null);
  return result;
}
