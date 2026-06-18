/** Cache de picos de waveform por URL (evita re-decodificar o mesmo áudio). */
const cache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[]>>();

const MAX_CONCURRENT = 3;
let active = 0;
const queue: Array<() => void> = [];

function runNext() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  active += 1;
  const job = queue.shift();
  job?.();
}

function schedule<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          runNext();
        });
    };
    queue.push(run);
    runNext();
  });
}

async function decodePeaks(url: string, barCount: number): Promise<number[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch_failed");
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const ch = audio.getChannelData(0);
    if (!ch.length) return Array.from({ length: barCount }, () => 0);
    const block = Math.max(1, Math.floor(ch.length / barCount));
    const peaks: number[] = [];
    for (let i = 0; i < barCount; i++) {
      let max = 0;
      const start = i * block;
      const end = Math.min(ch.length, start + block);
      for (let j = start; j < end; j++) max = Math.max(max, Math.abs(ch[j]!));
      peaks.push(max);
    }
    return peaks;
  } finally {
    void ctx.close();
  }
}

export async function getWaveformPeaks(url: string, barCount = 100): Promise<number[]> {
  const key = `${url}|${barCount}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let pending = inflight.get(key);
  if (!pending) {
    pending = schedule(() => decodePeaks(url, barCount)).then((peaks) => {
      cache.set(key, peaks);
      inflight.delete(key);
      return peaks;
    });
    inflight.set(key, pending);
  }
  return pending;
}
