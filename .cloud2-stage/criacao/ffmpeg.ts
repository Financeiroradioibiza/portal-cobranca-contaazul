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
