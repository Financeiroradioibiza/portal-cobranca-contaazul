import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bodyRms,
  detectMixSegundos,
  detectTrimFimMs,
  isQuietOutroTail,
} from './mixTrimDetect.js';

const HOP_SEC = 1102 / 11025;

function frames(sec: number): number {
  return Math.max(1, Math.round(sec / HOP_SEC));
}

/** Envelope sintético: corpo alto + fade de rádio nos últimos ~8 s. */
function synthRadioFade(totalSec = 240): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  const body = 0.5;
  for (let i = 0; i < n; i++) {
    env[i] = body;
  }
  const fadeStart = n - frames(8);
  for (let i = fadeStart; i < n; i++) {
    const t = (i - fadeStart) / (n - fadeStart);
    env[i] = body * (1 - t * 0.92);
  }
  return env;
}

/** Envelope sintético: outro quieto baixo (sem fade de rádio). */
function synthQuietOutro(totalSec = 240): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    env[i] = 0.45;
  }
  const quietStart = n - frames(18);
  for (let i = quietStart; i < n; i++) {
    env[i] = 0.08;
  }
  return env;
}

/** Silêncio morto ≥1,5 s após música. */
function synthDeadAir(totalSec = 200, deadSec = 1.5): Float32Array {
  const n = frames(totalSec);
  const env = new Float32Array(n);
  for (let i = 0; i < n - frames(deadSec); i++) {
    env[i] = 0.4;
  }
  return env;
}

test('detectMixSegundos encontra fade de rádio', () => {
  const env = synthRadioFade();
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix >= 1 && mix <= 22, `mix=${mix}`);
});

test('detectMixSegundos retorna 0 em outro quieto', () => {
  const env = synthQuietOutro();
  const body = bodyRms(env);
  const mix = detectMixSegundos(env, 0);
  assert.equal(mix, 0);
  assert.equal(isQuietOutroTail(env, 0, body), true);
});

test('detectTrimFimMs corta silêncio morto no final', () => {
  const env = synthDeadAir();
  const trim = detectTrimFimMs(env);
  assert.ok(trim >= 1200, `trim=${trim}`);
});

test('fade suave (jazz) não é bloqueado por outro quieto antes da busca', () => {
  const env = synthRadioFade(250);
  const body = bodyRms(env);
  const mix = detectMixSegundos(env, 0);
  assert.ok(mix > 0, 'fade deve ser detectado mesmo com energia moderada');
  assert.equal(isQuietOutroTail(env, 0, body), false);
});
