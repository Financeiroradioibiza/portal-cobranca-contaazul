import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMixTrim } from '/app/dist/criacao/mixTrimApply.js';
import { findMusicaSourceMp3 } from '/app/dist/criacao/reprocessEdicao.js';
import { portalQuery } from '/app/dist/criacao/portalDb.js';
import { ensureStorageDirs, uploadPath, workDir } from '/app/dist/criacao/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.FIXTURE ?? path.join(__dirname, 'mix-trim-calibracao.json');
const raw = await fsp.readFile(fixturePath, 'utf8');
const cases = JSON.parse(raw);

async function findInputPath(musicaId) {
  const item = await portalQuery(
    `SELECT pi.id AS item_id FROM processamento_item pi
      WHERE pi.musica_id = $1 AND pi.status = 'concluido'
      ORDER BY pi.updated_at DESC LIMIT 1`,
    [musicaId],
  );
  const itemId = item.rows[0]?.item_id;
  if (itemId) {
    const p = uploadPath(itemId);
    try {
      await fsp.access(p);
      return { inputPath: p, scratchWork: null };
    } catch {
      /* master/uso */
    }
  }
  ensureStorageDirs();
  const scratchWork = workDir(`cal-${musicaId.slice(0, 8)}`);
  await fsp.mkdir(scratchWork, { recursive: true });
  const inputPath = await findMusicaSourceMp3(musicaId, scratchWork);
  if (!inputPath) {
    await fsp.rm(scratchWork, { recursive: true, force: true }).catch(() => null);
    return null;
  }
  return { inputPath, scratchWork };
}

async function previewMix(musicaId) {
  const found = await findInputPath(musicaId);
  if (!found) return { ok: false, error: 'audio_ausente' };
  try {
    const r = await resolveMixTrim(found.inputPath);
    return { ok: true, mixSegundos: r.appliedMixSegundos, quietOutro: r.quietOutro };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (found.scratchWork) await fsp.rm(found.scratchWork, { recursive: true, force: true }).catch(() => null);
  }
}

function okMix(got, expect, tol = 1) {
  return Math.abs(got - expect) <= tol;
}

console.log('Calibração ponto de mix (dry-run — trim manual)\n');
console.log('Faixa'.padEnd(28), 'mix esp', 'mix det', 'status');
console.log('-'.repeat(56));

let pass = 0;
let fail = 0;

for (const c of cases) {
  const search = String(c.search ?? '').trim();
  const artistHint = String(c.artistHint ?? '').trim();
  if (!search) continue;

  let sql = `SELECT id, titulo, artista FROM musica_biblioteca WHERE status = 'pronta' AND titulo ILIKE $1`;
  const params = [`%${search}%`];
  if (artistHint) {
    sql += ` AND artista ILIKE $2`;
    params.push(`%${artistHint}%`);
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;

  const row = await portalQuery(sql, params);
  const m = row.rows[0];
  if (!m) {
    console.log(String(c.label ?? search).padEnd(28), '—', '—', 'NÃO ACHOU');
    fail++;
    continue;
  }

  const r = await previewMix(m.id);
  if (!r.ok) {
    console.log(String(c.label ?? search).padEnd(28), c.expectMix, '—', r.error ?? 'erro');
    fail++;
    continue;
  }

  const status = okMix(r.mixSegundos ?? 0, c.expectMix ?? 0) ? 'OK' : 'AJUSTAR';
  if (status === 'OK') pass++;
  else fail++;

  console.log(
    String(c.label ?? m.titulo.slice(0, 26)).padEnd(28),
    String(c.expectMix ?? 0).padStart(3),
    String(r.mixSegundos ?? 0).padStart(7),
    status,
  );
}

console.log('-'.repeat(56));
console.log(`\n${pass} OK · ${fail} para ajustar (tolerância mix ±1s)`);
