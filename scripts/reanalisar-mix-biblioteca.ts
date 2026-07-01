#!/usr/bin/env npx tsx
/**
 * Reanalisa mix/trim de faixas com mix=0 e mix_auto=true.
 *
 * Preferir (do Mac, sem SSH manual):
 *   bash scripts/reanalisar-mix-biblioteca-remote.sh [--limit=50]
 *
 * Ou pelo portal: Criação → Edição → marcar faixas → Detectar mix/trim automaticamente.
 */
import { resolveMixTrim, persistMixTrimForMusica } from '../.cloud2-stage/criacao/mixTrimApply.js';
import { portalQuery } from '../.cloud2-stage/criacao/portalDb.js';
import { uploadPath } from '../.cloud2-stage/criacao/storage.js';
import fsp from 'node:fs/promises';

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;

async function main() {
  const rows = await portalQuery<{ id: string; titulo: string; artista: string }>(
    `SELECT id, titulo, artista
       FROM musica_biblioteca
      WHERE status = 'pronta'
        AND mix_auto = true
        AND COALESCE(mix_segundos_finais, 0) = 0
      ORDER BY updated_at DESC
      LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  );

  console.log(`Reanalisando ${rows.rows.length} faixa(s)…`);

  for (const m of rows.rows) {
    const item = await portalQuery<{ item_id: string }>(
      `SELECT pi.id AS item_id
         FROM processamento_item pi
        WHERE pi.musica_id = $1
          AND pi.status = 'concluido'
        ORDER BY pi.updated_at DESC
        LIMIT 1`,
      [m.id],
    );
    const itemId = item.rows[0]?.item_id;
    if (!itemId) {
      console.log(`  skip ${m.artista} — ${m.titulo}: sem item de upload`);
      continue;
    }

    const inputPath = uploadPath(itemId);
    try {
      await fsp.access(inputPath);
    } catch {
      console.log(`  skip ${m.artista} — ${m.titulo}: upload bruto ausente (${inputPath})`);
      continue;
    }

    const resolved = await resolveMixTrim(inputPath);
    await persistMixTrimForMusica(m.id, resolved, true, false);
    console.log(
      `  ok ${m.artista} — ${m.titulo}: mix=${resolved.appliedMixSegundos}s` +
        (resolved.mixSegundosFinais > 0 ? ' (fade)' : resolved.quietOutro ? ' (outro quieto)' : ' (sem fade)'),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
