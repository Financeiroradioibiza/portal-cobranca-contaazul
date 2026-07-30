import { prisma } from "../lib/prisma";
import { buildServidorUpUploadPlan } from "../lib/criacao/servidorUpUploadService";
import {
  buildDownloadItemMatchIndexes,
  deezerTrackIdFromUrl,
  resolveDownloadItemForTrack,
} from "../lib/criacao/servidorUpUploadReconcile";
import type { ServidorUpUploadSession } from "../lib/criacao/servidorUpUploadSession";

const JOB = process.argv[2]?.trim();
if (!JOB) {
  console.error("Uso: npx tsx scripts/audit-su-job-pairing.ts <downloadJobId>");
  process.exit(1);
}

async function main() {
  if (JOB === "list") {
    const rows = await prisma.servidorUpUploadSnapshot.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { downloadJobId: true, updatedAt: true },
    });
    console.log("Snapshots recentes:", rows);
    const jobs = await prisma.downloadJob.findMany({
      where: { titulo: { contains: "Servidor UP", mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, titulo: true, totalItens: true, status: true },
    });
    console.log("Jobs Servidor UP:", jobs);
    return;
  }

  const snap = await prisma.servidorUpUploadSnapshot.findFirst({
    where: { downloadJobId: { equals: JOB, mode: "insensitive" } },
  });
  if (!snap) {
    console.log("Snapshot não encontrado para", JOB);
    return;
  }
  const s = snap.payload as ServidorUpUploadSession;
  console.log("Snapshot tracks:", s.tracks.length, "savedAt", new Date(snap.updatedAt).toISOString());

  const items = await prisma.downloadItem.findMany({
    where: { jobId: snap.downloadJobId, status: "concluido" },
    select: {
      id: true,
      linhaOriginal: true,
      providerRef: true,
      storageKey: true,
      titulo: true,
      artista: true,
      arquivoNome: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const imported = items.filter((i) => i.providerRef.startsWith("import:"));
  const staging = items.filter((i) => !i.providerRef.startsWith("import:") && i.storageKey);
  const noStaging = items.filter((i) => !i.providerRef.startsWith("import:") && !i.storageKey);

  console.log("Download items concluido:", items.length);
  console.log("  importados (já na fila):", imported.length);
  console.log("  staging pronto:", staging.length);
  console.log("  sem storageKey:", noStaging.length);

  const plan = await buildServidorUpUploadPlan({
    downloadJobId: snap.downloadJobId,
    hierarchyRows: s.hierarchyRows,
    drafts: s.drafts ?? {},
    tracks: s.tracks,
  });
  const matched = plan.lotes.reduce((n, l) => n + l.tracks.length, 0);
  console.log(
    "Plano matched:",
    matched,
    "alreadyEnqueued:",
    plan.alreadyEnqueuedTracks.length,
    "unmatched:",
    plan.unmatchedTracks.length,
    "orphan:",
    plan.orphanDownloadItems,
  );

  // Diagnóstico: unmatched por motivo
  const indexes = buildDownloadItemMatchIndexes(
    staging.map(({ providerRef: _pr, ...rest }) => rest),
  );
  const used = new Set<string>();
  let idMiss = 0;
  let noUrlId = 0;
  let wouldImport = 0;

  for (const track of s.tracks) {
    const deezerId = deezerTrackIdFromUrl(track.deezerUrl);
    if (!deezerId) {
      noUrlId++;
      continue;
    }
    const hit = resolveDownloadItemForTrack(
      track,
      indexes,
      staging.map(({ providerRef: _pr, ...rest }) => rest),
      used,
    );
    if (hit) {
      used.add(hit.id);
      continue;
    }
    const imp = imported.find((i) => deezerTrackIdFromUrl(i.linhaOriginal) === deezerId);
    if (imp) wouldImport++;
    else idMiss++;
  }

  console.log("Diagnóstico snapshot:");
  console.log("  track sem deezer id na URL:", noUrlId);
  console.log("  unmatched mas já importado (import:):", wouldImport);
  console.log("  unmatched sem MP3/id no staging:", idMiss);

  if (plan.unmatchedTracks.length > 0) {
    console.log("\nExemplos unmatched:");
    plan.unmatchedTracks.slice(0, 5).forEach((u) => console.log(" ", u));
  }
}

main().finally(() => prisma.$disconnect());
