import { spawn } from 'node:child_process';
import { criacaoConfig } from './config.js';

/**
 * Estima segundos finais de mix (crossfade) via silencedetect no ffmpeg.
 * Fallback: defaultMixSegundos (1 s).
 */
export async function detectMixSegundosFinais(inputPath: string): Promise<number> {
  const fallback = criacaoConfig.defaultMixSegundos;
  const tailSec = Math.min(20, Math.max(8, fallback + 12));

  return new Promise((resolve) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'info',
        '-sseof',
        `-${tailSec}`,
        '-i',
        inputPath,
        '-af',
        'silencedetect=noise=-32dB:d=0.25',
        '-f',
        'null',
        '-',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', () => resolve(fallback));
    proc.on('close', () => {
      const ends: number[] = [];
      for (const m of stderr.matchAll(/silence_end:\s*([\d.]+)/g)) {
        const v = parseFloat(m[1] ?? '');
        if (Number.isFinite(v)) ends.push(v);
      }
      if (ends.length === 0) {
        resolve(fallback);
        return;
      }
      const lastEnd = ends[ends.length - 1]!;
      const mix = Math.max(fallback, Math.min(12, Math.ceil(tailSec - lastEnd + fallback)));
      resolve(mix);
    });
  });
}
