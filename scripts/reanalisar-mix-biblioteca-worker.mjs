import { reanalisarMixTrimAutoZeroBulk } from './dist/criacao/reanalisarMixTrim.js';

const limit = Math.min(500, Math.max(1, Number(process.env.LIMIT) || 100));
const results = await reanalisarMixTrimAutoZeroBulk(limit);

console.log(`Faixas: ${results.length}`);

for (const r of results) {
  if (!r.ok) {
    console.log(`  skip ${r.artista ?? '?'} — ${r.titulo ?? r.musicaId}: ${r.error ?? 'erro'}`);
    continue;
  }
  const tag = r.quietOutro ? 'outro quieto' : (r.mixSegundos ?? 0) > 0 ? 'fade' : 'sem fade';
  console.log(
    `  ok ${r.artista ?? '?'} — ${r.titulo ?? r.musicaId}: mix=${r.mixSegundos}s trim=${r.trimFimMs}ms (${tag})`,
  );
}
