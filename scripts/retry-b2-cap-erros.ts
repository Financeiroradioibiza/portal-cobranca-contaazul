/**
 * Reenfileira itens que falharam por cap do Backblaze B2.
 * Uso: aumente o cap em backblaze.com → Caps & Alerts, depois:
 *   npm run criacao:retry-b2-cap-erros
 */
import { prisma } from "../lib/prisma";

const CAP_RE = /storage cap exceeded/i;

async function main() {
  const items = await prisma.processamentoItem.findMany({
    where: {
      status: "erro",
      erroMsg: { contains: "storage cap exceeded", mode: "insensitive" },
    },
    select: { id: true, jobId: true, arquivoNome: true },
  });

  if (items.length === 0) {
    console.log("Nenhum item com erro de storage cap.");
    return;
  }

  const jobIds = [...new Set(items.map((i) => i.jobId))];
  console.log(`Reenfileirando ${items.length} item(ns) em ${jobIds.length} job(s)...`);

  const updated = await prisma.processamentoItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: {
      status: "aguardando",
      etapaAtual: "armazenamento",
      erroMsg: "",
    },
  });

  await prisma.processamentoJob.updateMany({
    where: { id: { in: jobIds }, status: "erro" },
    data: {
      status: "aguardando",
      etapaAtual: "armazenamento",
      erroMsg: "",
      finishedAt: null,
    },
  });

  console.log(`OK: ${updated.count} item(ns) voltaram para aguardando (etapa armazenamento).`);
  console.log("O worker cloud2 deve retomar em alguns minutos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
