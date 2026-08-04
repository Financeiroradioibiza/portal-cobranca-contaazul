import { prisma } from "../lib/prisma";

const JOB = process.argv[2] ?? "cmsdve8ho000080d41l1pbvzd";

async function main() {
  for (const nome of ["Boteco Princesa", "Iraja Redux"]) {
    const progs = await prisma.programacao.findMany({
      where: { clienteNome: { contains: nome, mode: "insensitive" } },
      select: {
        id: true,
        clienteNome: true,
        nome: true,
        revisionAtual: true,
        pastas: {
          select: { nome: true, _count: { select: { musicas: true } } },
          orderBy: { nome: "asc" },
        },
      },
    });
    console.log("\n=== PORTAL:", nome, "===");
    let total = 0;
    for (const p of progs) {
      console.log(" Prog:", p.nome);
      for (const pasta of p.pastas) {
        const n = pasta._count.musicas;
        total += n;
        console.log("  ", pasta.nome, ":", n);
      }
    }
    console.log(" TOTAL:", total);
  }

  const snap = await prisma.servidorUpUploadSnapshot.findUnique({ where: { downloadJobId: JOB } });
  if (snap) {
    const p = snap.payload as {
      tracks?: { pastaNome?: string }[];
      filaEnqueue?: Record<string, unknown>;
    };
    console.log("\n=== SNAPSHOT", JOB.slice(0, 8), "===");
    console.log("Sessão tracks:", p.tracks?.length);
    console.log("Fila:", JSON.stringify(p.filaEnqueue));
    const byPasta: Record<string, number> = {};
    for (const t of p.tracks ?? []) {
      const k = t.pastaNome ?? "?";
      byPasta[k] = (byPasta[k] ?? 0) + 1;
    }
    console.log("Esperado snapshot:", byPasta);
    console.log("Soma:", Object.values(byPasta).reduce((a, b) => a + b, 0));
  } else {
    console.log("\nSnapshot não encontrado:", JOB);
  }

  const dlJob = await prisma.criacaoDownloadJob.findUnique({
    where: { id: JOB },
    select: { titulo: true, status: true, totalItens: true, itensOk: true, itensErro: true },
  });
  console.log("\nDEEMIX", dlJob);

  const items = await prisma.criacaoDownloadItem.groupBy({
    by: ["status"],
    where: { jobId: JOB },
    _count: true,
  });
  console.log("Deemix items", items);

  const pending = await prisma.processamentoItem.count({
    where: {
      status: { in: ["aguardando", "processando"] },
      job: { titulo: { contains: "LegadoTeste" } },
    },
  });
  const erros = await prisma.processamentoItem.count({
    where: { status: "erro", job: { titulo: { contains: "LegadoTeste" } } },
  });
  const concluidos = await prisma.processamentoItem.count({
    where: { status: "concluido", job: { titulo: { contains: "LegadoTeste" } } },
  });
  console.log("\nFila LegadoTeste — concluído:", concluidos, "pendente:", pending, "erro:", erros);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
