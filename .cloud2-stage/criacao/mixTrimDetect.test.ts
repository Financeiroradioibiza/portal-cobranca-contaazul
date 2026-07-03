import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bodyRms,
  detectMixSegundos,
  detectTrimFimMs,
  HOP_SEC,
  isQuietOutroTail,
} from './mixTrimDetect.js';

function frames(sec: number): number {
  return Math.max(1, Math.round(sec / HOP_SEC));
}

/** Envelope sintético: corpo alto + fade de rádio nos últimos ~8 s. */
function synthRadioFade(totalSec = 240, fadeSec = 8): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.5;
  for (let i = 0; i < n; i++) env[i] = body;
  const fadeStart = n - frames(fadeSec);
  for (let i = fadeStart; i < n; i++) {
    const t = (i - fadeStart) / (n - fadeStart);
    env[i] = body * (1 - t * 0.92);
  }
  return env;
}

/** Fade longo (~10 s) — ex. Greta Mirall mix ~8. */
function synthLongFade(totalSec = 161, fadeSec = 10): Float32Array {
  return synthRadioFade(totalSec, fadeSec);
}

/** Fade curto (~6 s) — ex. It Had To Be You mix ~4. */
function synthShortFade(totalSec = 158, fadeSec = 6): Float32Array {
  return synthRadioFade(totalSec, fadeSec);
}

/** Fade + cauda fina de ruído — ex. And so It Goes trim ~6 mix ~3. */
function synthFadePlusThinTail(totalSec = 151, fadeSec = 5, tailSec = 6): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.45;
  for (let i = 0; i < n; i++) env[i] = body;
  const fadeStart = n - frames(fadeSec + tailSec);
  for (let i = fadeStart; i < n - frames(tailSec); i++) {
    const t = (i - fadeStart) / (n - frames(tailSec) - fadeStart);
    env[i] = body * (1 - t * 0.88);
  }
  for (let i = n - frames(tailSec); i < n; i++) {
    env[i] = body * 0.06;
  }
  return env;
}

/** Música + rumble longo — ex. Lullaby trim ~27 mix ~4. */
function synthMusicPlusRumble(totalSec = 145, musicSec = 118, _rumbleSec = 27): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.48;
  const musicEnd = frames(musicSec);
  for (let i = 0; i < musicEnd; i++) env[i] = body;
  const fadeStart = musicEnd - frames(6);
  for (let i = fadeStart; i < musicEnd; i++) {
    const t = (i - fadeStart) / (musicEnd - fadeStart);
    env[i] = body * (1 - t * 0.55);
  }
  for (let i = musicEnd; i < n; i++) {
    env[i] = body * 0.09 + (i % 3) * 0.004;
  }
  return env;
}

/** Outro quieto baixo contínuo (What's Up) — mix 0. */
function synthQuietOutro(totalSec = 240): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = 0.45;
  const quietStart = n - frames(18);
  for (let i = quietStart; i < n; i++) env[i] = 0.08;
  return env;
}

/** Silêncio morto ≥2 s após música. */
function synthDeadAir(totalSec = 200, deadSec = 2.5): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  for (let i = 0; i < n - frames(deadSec); i++) env[i] = 0.4;
  return env;
}

test('detectMixSegundos encontra fade de rádio (~5 s, Chez moi)', () => {
  const env = synthRadioFade(155, 7);
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 3 && mix <= 5, `mix=${mix}`);
});

test('fade longo Greta Mirall mix ~8', () => {
  const env = synthLongFade();
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 4 && mix <= 6, `mix=${mix}`);
});

test('fade curto It Had To Be You mix ~4', () => {
  const env = synthShortFade();
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 2 && mix <= 4, `mix=${mix}`);
});

test('And so It Goes trim 0 e mix ~3 (fade no fim, sem trim)', () => {
  const env = synthFadePlusThinTail();
  const body = bodyRms(env);
  const trim = detectTrimFimMs(env, body);
  const mix = detectMixSegundos(env, trim, body);
  assert.equal(trim, 0, `trim=${trim}`);
  assert.ok(mix >= 2, `mix=${mix}`);
});

test('fade longo tipo Seasons — trim 0 e mix > 0', () => {
  const env = synthRadioFade(166, 9);
  const body = bodyRms(env);
  const trim = detectTrimFimMs(env, body);
  const mix = detectMixSegundos(env, trim, body);
  assert.equal(trim, 0, `trim=${trim}`);
  assert.ok(mix >= 4 && mix <= 6, `mix=${mix}`);
});

test('Lullaby — trim automático desligado; mix detectado', () => {
  const env = synthMusicPlusRumble();
  const body = bodyRms(env);
  const mix = detectMixSegundos(env, 0, body);
  assert.equal(detectTrimFimMs(env, body), 0, 'trim auto desligado');
  assert.ok(mix >= 3 && mix <= 14, `mix=${mix}`);
});

test('detectMixSegundos retorna 0 em outro quieto', () => {
  const env = synthQuietOutro();
  const body = bodyRms(env);
  const mix = detectMixSegundos(env, 0, body);
  assert.equal(mix, 0);
  assert.equal(isQuietOutroTail(env, body, 0), true);
});

test('trim automático sempre desligado', () => {
  assert.equal(detectTrimFimMs(synthDeadAir()), 0);
  assert.equal(detectTrimFimMs(synthMusicPlusRumble()), 0);
});

/** Fade gradual longo (Harvest Moon / Be My Man) — mix no meio do fade, não só no fim. */
function synthGradualLongFade(totalSec = 185, fadeSec = 12): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.46;
  for (let i = 0; i < n; i++) env[i] = body;
  const fadeStart = n - frames(fadeSec);
  for (let i = fadeStart; i < n; i++) {
    const t = (i - fadeStart) / (n - fadeStart);
    env[i] = body * (1 - t * 0.88) + (i % 5) * 0.006;
  }
  return env;
}

/** Clímax no fim + fade curto depois (Sunday Morning) — não antecipar 18 s. */
function synthClimaxThenShortFade(totalSec = 200, buildSec = 6, fadeSec = 5): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.42;
  for (let i = 0; i < n; i++) env[i] = body;
  const buildStart = n - frames(buildSec + fadeSec);
  const fadeStart = n - frames(fadeSec);
  for (let i = buildStart; i < fadeStart; i++) {
    const t = (i - buildStart) / (fadeStart - buildStart);
    env[i] = body * (0.72 + t * 0.38);
  }
  for (let i = fadeStart; i < n; i++) {
    const t = (i - fadeStart) / (n - fadeStart);
    env[i] = body * (1.08 * (1 - t * 0.9));
  }
  return env;
}

test('fade gradual longo — mix no meio do fade (Harvest / Be My Man)', () => {
  const env = synthGradualLongFade(185, 18);
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 7 && mix <= 10, `mix=${mix}`);
});

test('fade gradual médio — Be My Man ~8 s', () => {
  const env = synthGradualLongFade(180, 16);
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 6 && mix <= 9, `mix=${mix}`);
});

test('clímax antes do fade — mix curto, não 18 s (Sunday Morning)', () => {
  const env = synthClimaxThenShortFade();
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 2 && mix <= 6, `mix=${mix}`);
});

test('fade suave não é bloqueado por outro quieto', () => {
  const env = synthRadioFade(250, 8);
  const body = bodyRms(env);
  const mix = detectMixSegundos(env, 0, body);
  assert.ok(mix > 0, 'fade deve ser detectado');
  assert.equal(isQuietOutroTail(env, body, 0), false);
});

/** Fade MPB/samba que termina baixo mas ainda desce (Coisinha do Pai, Partido alto) — mix > 0. */
function synthSambaFadeEndingLow(totalSec = 182, fadeSec = 14): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.45;
  for (let i = 0; i < n; i++) env[i] = body;
  const fadeStart = n - frames(fadeSec);
  for (let i = fadeStart; i < n; i++) {
    const t = (i - fadeStart) / (n - fadeStart);
    env[i] = body * (0.26 + (1 - t) * 0.74);
  }
  return env;
}

test('fade samba/MPB terminando baixo — não confundir com outro quieto (mix 0)', () => {
  const env = synthSambaFadeEndingLow();
  const body = bodyRms(env);
  assert.equal(isQuietOutroTail(env, body, 0), false, 'não é outro quieto');
  const mix = detectMixSegundos(env, 0, body);
  assert.ok(mix >= 4 && mix <= 9, `mix=${mix}`);
});
