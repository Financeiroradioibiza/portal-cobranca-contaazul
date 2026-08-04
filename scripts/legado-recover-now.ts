/**
 * Recover completo Servidor UP LegadoTeste — enfileira faltantes + staging + night-worker.
 * Uso: npx esbuild ... && node .legado-recover-now.run.cjs [downloadJobId]
 */
import { prisma } from "../lib/prisma";
import { recoverServidorUpMissingTracksAll } from "../lib/criacao/servidorUpRecoverMissingService";
import { recoverServidorUpStagingForDownloadJob } from "../lib/criacao/servidorUpRecoverStagingService";
import { runServidorUpNightWorker, runAutoEnqueueForSnapshot } from "../lib/criacao/servidorUpEnqueueFilaService";

const JOB = (process.argv[2] ?? "cmsdve8ho000080d41l1pbvzd").trim();

async function portalCounts() {
  const out: Record<string, number> = {};
  for (const nome of ["Boteco Princesa", "Iraja Redux"]) {
    const progs = await prisma.programacao.findMany({
      where: { clienteNome: { contains: nome, mode: "insensitive" } },
      select: { pastas: { select: { nome: true, _count: { select: { musicas: true } } } } },
    });
    for (const p of progs) for (const pasta of p.pastas) out[pasta.nome] = pasta._count.musicas;
  }
  return out;
}

async function filaStats() {
  const g = await prisma.processamentoItem.groupBy({
    by: ["status"],
    where: { job: { titulo: { contains: "LegadoTeste" } } },
    _count: true,
  });
  return Object.fromEntries(g.map((x) => [x.status, x._count]));
}

async function main() {
  console.log("=== Recover NOW · job", JOB, "===\n");
  console.log("Portal antes:", await portalCounts());
  console.log("Fila antes:", await filaStats());

  console.log("\n--- 1) Missing tracks (enfileirar faltantes) ---");
  const missing = await recoverServidorUpMissingTracksAll(JOB, { maxRounds: 40 });
  console.log(JSON.stringify(missing, null, 2));

  console.log("\n--- 2) Staging Deemix → cloud2 (até 15 rodadas) ---");
  let stagingTotal = 0;
  for (let i = 1; i <= 15; i++) {
    const r = await recoverServidorUpStagingForDownloadJob(JOB, { maxItems: 200 });
    console.log(`rodada ${i}: imported=${r.imported} pairs=${r.pairsAttempted}`, r.errors[0] ?? "ok");
    stagingTotal += r.imported;
    if (r.imported === 0) break;
  }
  console.log("Staging total importado:", stagingTotal);

  console.log("\n--- 3) Auto-enqueue fila (chunks) ---");
  for (let i = 0; i < 12; i++) {
    const r = await runAutoEnqueueForSnapshot(JOB);
    if (!r) {
      console.log("auto-enqueue: nada pendente");
      break;
    }
    console.log(`chunk ${i + 1}: imported=${r.tracksImported} done=${r.done} ok=${r.ok}`, r.error ?? "");
    if (!r.ok || r.done) break;
  }

  console.log("\n--- 4) Night-worker ---");
  const nw = await runServidorUpNightWorker({ downloadLimit: 20, maxSnapshots: 20 });
  console.log(JSON.stringify(nw, null, 2));

  console.log("\n--- 5) Staging pós-worker ---");
  for (let i = 1; i <= 8; i++) {
    const r = await recoverServidorUpStagingForDownloadJob(JOB, { maxItems: 200 });
    if (r.imported === 0) break;
    console.log(`pós ${i}: imported=${r.imported}`);
  }

  console.log("\n=== Depois ===");
  console.log("Portal:", await portalCounts());
  console.log("Fila:", await filaStats());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
