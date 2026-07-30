/**
 * Reimporta MP3 Deemix → upload cloud2 para itens com erro arquivo_upload_ausente.
 * Uso: npm run criacao:reimport-upload-ausente
 */
import { prisma } from "../lib/prisma";
import { ingestFromStagingOnCloud2 } from "../lib/criacao/ingestFromStaging";
import {
  arquivoNomeMatchKey,
  buildTrackToDownloadIndexMap,
  legacyStemArtistTitle,
} from "../lib/criacao/servidorUpUploadReconcile";
import {
  buildServidorUpUploadPlan,
  type ServidorUpUploadTrackInput,
} from "../lib/criacao/servidorUpUploadService";
import { getServidorUpUploadSnapshot } from "../lib/criacao/servidorUpUploadSnapshotService";
import type { ServidorUpUploadSessionMeta } from "../lib/criacao/servidorUpEnqueueFilaService";

const DOWNLOAD_JOB_ID = "cms6ozo7b001e1xbi1a515ec2";

function matchDownloadId(
  arquivoNome: string,
  planByKey: Map<string, string>,
  indexMap: Map<string, { id: string }>,
  tracks: ServidorUpUploadTrackInput[],
): string | undefined {
  const key = arquivoNomeMatchKey(arquivoNome);
  const fromPlan = planByKey.get(key);
  if (fromPlan) return fromPlan;
  for (const track of tracks) {
    const leg = legacyStemArtistTitle(track.relativePath);
    if (!leg) continue;
    if (arquivoNomeMatchKey(`${leg.artista} - ${leg.titulo}.mp3`) !== key) continue;
    return indexMap.get(track.relativePath)?.id;
  }
  return undefined;
}

async function main() {
  const snapshot = (await getServidorUpUploadSnapshot(DOWNLOAD_JOB_ID)) as ServidorUpUploadSessionMeta | null;
  if (!snapshot?.tracks?.length) {
    console.log("Snapshot não encontrado.");
    return;
  }

  const tracks = snapshot.tracks as ServidorUpUploadTrackInput[];
  const plan = await buildServidorUpUploadPlan({
    downloadJobId: DOWNLOAD_JOB_ID,
    hierarchyRows: snapshot.hierarchyRows,
    drafts: snapshot.drafts ?? {},
    tracks,
  });
  const planByKey = new Map<string, string>();
  for (const lote of plan.lotes) {
    for (const t of lote.tracks) {
      planByKey.set(arquivoNomeMatchKey(t.arquivoNome), t.downloadItemId);
      planByKey.set(arquivoNomeMatchKey(`${t.artista} - ${t.titulo}.mp3`), t.downloadItemId);
    }
  }

  const allJobItems = await prisma.downloadItem.findMany({
    where: { jobId: DOWNLOAD_JOB_ID, status: "concluido", storageKey: { not: null } },
    select: { id: true, createdAt: true, linhaOriginal: true, titulo: true, artista: true, arquivoNome: true, sizeBytes: true },
    orderBy: { createdAt: "asc" },
  });
  const indexMap = buildTrackToDownloadIndexMap(tracks, allJobItems);

  const erros = await prisma.processamentoItem.findMany({
    where: {
      status: "erro",
      erroMsg: "arquivo_upload_ausente",
      job: { titulo: { contains: "LegadoTeste" } },
    },
    select: { id: true, jobId: true, arquivoNome: true },
    orderBy: { createdAt: "asc" },
  });

  if (erros.length === 0) {
    console.log("Nenhum item com arquivo_upload_ausente.");
    return;
  }

  console.log(`Itens com upload ausente: ${erros.length}`);

  let imported = 0;
  let semPar = 0;
  let stagingMissing = 0;
  const allErrors: string[] = [];
  const usedDownload = new Set<string>();

  for (const item of erros) {
    let dlId =
      (
        await prisma.downloadItem.findFirst({
          where: { providerRef: `import:${item.id}` },
          select: { id: true },
        })
      )?.id ??
      matchDownloadId(item.arquivoNome, planByKey, indexMap, tracks);

    if (!dlId || usedDownload.has(dlId)) {
      semPar++;
      continue;
    }
    usedDownload.add(dlId);

    await prisma.downloadItem.update({
      where: { id: dlId },
      data: { providerRef: "" },
    });
    await prisma.processamentoItem.update({
      where: { id: item.id },
      data: {
        status: "aguardando",
        etapaAtual: "deduplicacao",
        erroMsg: "",
        rawStorageKey: null,
      },
    });
    await prisma.processamentoJob.update({
      where: { id: item.jobId },
      data: { status: "aguardando", etapaAtual: "deduplicacao", erroMsg: "", finishedAt: null },
    });

    const r = await ingestFromStagingOnCloud2([
      { processamentoItemId: item.id, downloadItemId: dlId },
    ]);
    if (r.imported > 0) {
      imported++;
      if (imported % 20 === 0) console.log(`  … ${imported} reimportados`);
    } else {
      const err = r.errors[0] ?? "erro";
      allErrors.push(`${item.arquivoNome.slice(0, 40)}: ${err}`);
      if (/arquivo_ausente|download_ja_importado/i.test(err)) stagingMissing++;
    }
  }

  console.log(`\nTotal importado=${imported}/${erros.length}`);
  console.log(`sem par: ${semPar}, falha staging/import: ${stagingMissing}`);
  if (allErrors.length) {
    console.log("Erros (amostra):", [...new Set(allErrors)].slice(0, 8).join("\n  "));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
