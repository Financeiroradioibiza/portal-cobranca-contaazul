/**
 * Uso: npm run criacao:recover-staging
 * Recupera MP3 Deemix → upload cloud2 para jobs Servidor UP travados.
 */
import { prisma } from "../lib/prisma";
import { recoverStagingForJob } from "../lib/criacao/stagingRecoverService";

async function main() {
  const jobs = await prisma.processamentoJob.findMany({
    where: {
      status: { in: ["aguardando", "processando"] },
      itens: { some: { status: "aguardando", rawStorageKey: null } },
    },
    select: { id: true, titulo: true, itensFeitos: true, totalItens: true },
    orderBy: { createdAt: "asc" },
  });
  if (jobs.length === 0) {
    console.log("Nenhum job com faixas sem MP3 no cloud2.");
    return;
  }
  for (const j of jobs) {
    console.log(`\n→ ${j.titulo} (${j.itensFeitos}/${j.totalItens})`);
    const r = await recoverStagingForJob(j.id);
    console.log(`  imported=${r.imported}`, r.errors.slice(0, 5).join(" · ") || "ok");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
