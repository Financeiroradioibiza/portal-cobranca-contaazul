import { prisma } from "../lib/prisma";
import { deezerTrackIdFromUrl } from "../lib/criacao/servidorUpUploadReconcile";
import type { ServidorUpUploadSession } from "../lib/criacao/servidorUpUploadSession";

const JOB = process.argv[2]?.trim() ?? "cms7pd29l0000nc6at0tjuvww";

async function main() {
  const snap = await prisma.servidorUpUploadSnapshot.findUnique({
    where: { downloadJobId: JOB },
  });
  const session = snap?.payload as ServidorUpUploadSession | undefined;
  const trackByDeezerId = new Map<string, (typeof session)["tracks"][0]>();
  for (const t of session?.tracks ?? []) {
    const id = deezerTrackIdFromUrl(t.deezerUrl);
    if (id) trackByDeezerId.set(id, t);
  }

  const filaJobIds =
    (session as { filaEnqueue?: { jobIds?: string[] } } | undefined)?.filaEnqueue?.jobIds ?? [];

  const recentJobs = await prisma.processamentoJob.findMany({
    where: {
      OR: [
        { id: { in: filaJobIds } },
        {
          titulo: { contains: "LegadoTeste", mode: "insensitive" },
          createdAt: { gte: new Date("2026-07-30T12:00:00Z") },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      titulo: true,
      status: true,
      createdAt: true,
      pastaId: true,
      _count: { select: { itens: true } },
    },
  });

  console.log("Fila jobs recentes:", recentJobs.length);

  const jobIds = recentJobs.map((j) => j.id);
  const items = await prisma.processamentoItem.findMany({
    where: { jobId: { in: jobIds } },
    select: {
      id: true,
      jobId: true,
      arquivoNome: true,
      status: true,
      erroMsg: true,
      duplicataDeId: true,
      musicaId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const byStatus = new Map<string, number>();
  for (const i of items) byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);
  console.log("Itens por status:", Object.fromEntries(byStatus));

  const duplicatas = items.filter((i) => i.status === "duplicata" || i.erroMsg.includes("duplicata"));
  console.log("Duplicatas:", duplicatas.length);

  // Compare uploaded filename artist/title vs biblioteca match
  const musicaIds = [...new Set(duplicatas.map((d) => d.duplicataDeId ?? d.musicaId).filter(Boolean) as string[])];
  const musicas = await prisma.musicaBiblioteca.findMany({
    where: { id: { in: musicaIds.slice(0, 200) } },
    select: { id: true, artista: true, titulo: true, contentHash: true },
  });
  const musicaById = new Map(musicas.map((m) => [m.id, m]));

  let metadataLike = 0;
  let hashLike = 0;
  const samples: string[] = [];

  for (const item of duplicatas.slice(0, 30)) {
    const existId = item.duplicataDeId ?? item.musicaId;
    const bib = existId ? musicaById.get(existId) : undefined;
    const uploadName = item.arquivoNome.replace(/\.mp3$/i, "");
    const bibLabel = bib ? `${bib.artista} — ${bib.titulo}` : "?";
    if (item.erroMsg.includes("confirmada")) hashLike++;
    else metadataLike++;
    if (samples.length < 8) {
      samples.push(`UP: ${uploadName}\n   → BIB: ${bibLabel} (${item.status} / ${item.erroMsg.slice(0, 40)})`);
    }
  }

  console.log("\nAmostras duplicata:");
  samples.forEach((s) => console.log(s));

  // Download items pairing check for last batch
  const dlItems = await prisma.downloadItem.findMany({
    where: { jobId: JOB, providerRef: { startsWith: "import:" } },
    select: { id: true, linhaOriginal: true, titulo: true, artista: true, providerRef: true },
    take: 500,
  });
  console.log("\nDownload items importados:", dlItems.length);

  let pairingOk = 0;
  let pairingBad = 0;
  for (const dl of dlItems.slice(0, 50)) {
    const dzId = deezerTrackIdFromUrl(dl.linhaOriginal);
    const expected = dzId ? trackByDeezerId.get(dzId) : undefined;
    const procId = dl.providerRef.replace(/^import:/, "");
    const proc = items.find((i) => i.id === procId);
    if (!expected || !proc) continue;
    const leg = expected.relativePath.split("/").pop()?.replace(/\.mp3$/i, "").replace(/~\d+$/, "") ?? "";
    const procBase = proc.arquivoNome.replace(/\.mp3$/i, "");
    const legNorm = leg.toLowerCase().slice(0, 20);
    const procNorm = procBase.toLowerCase().slice(0, 20);
    if (procBase.includes(expected.relativePath.split("/").pop()?.split(" - ")[0]?.slice(0, 8) ?? "ZZZZ")) {
      pairingOk++;
    } else {
      pairingBad++;
      if (pairingBad <= 5) {
        console.log("PAIR BAD:", leg, "→ proc:", procBase, "deezer:", dzId);
      }
    }
  }
  console.log("Pairing sample ok/bad:", pairingOk, pairingBad);
}

main().finally(() => prisma.$disconnect());
