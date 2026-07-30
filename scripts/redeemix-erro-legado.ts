/**
 * Re-baixa MP3 Deemix para itens com staging ausente + reabre job concluído.
 * Uso: npm run criacao:redeemix-erro-legado
 */
import { prisma } from "../lib/prisma";
import { triggerDownloadProcessing } from "../lib/criacao/downloadService";
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
    where: { jobId: DOWNLOAD_JOB_ID, status: "concluido" },
    select: {
      id: true,
      createdAt: true,
      linhaOriginal: true,
      titulo: true,
      artista: true,
      arquivoNome: true,
      sizeBytes: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const indexMap = buildTrackToDownloadIndexMap(tracks, allJobItems);

  const erros = await prisma.processamentoItem.findMany({
    where: {
      status: "aguardando",
      rawStorageKey: null,
      job: { titulo: { contains: "LegadoTeste" } },
    },
    select: { id: true, jobId: true, arquivoNome: true, erroMsg: true },
  });

  console.log(`Itens aguardando sem MP3 no cloud2: ${erros.length}`);

  const dlIds = new Set<string>();
  let semPar = 0;
  for (const item of erros) {
    const dlId = matchDownloadId(item.arquivoNome, planByKey, indexMap, tracks);
    if (!dlId) {
      semPar++;
      continue;
    }
    dlIds.add(dlId);
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
      data: {
        status: "aguardando",
        etapaAtual: "deduplicacao",
        erroMsg: "",
        finishedAt: null,
      },
    });
  }

  if (dlIds.size === 0) {
    console.log("Nenhum download item para re-enfileirar.", { semPar });
    return;
  }

  const r = await prisma.downloadItem.updateMany({
    where: { id: { in: [...dlIds] } },
    data: {
      status: "aguardando",
      providerRef: "",
      storageKey: null,
      sizeBytes: null,
      erroMsg: "",
    },
  });

  await prisma.downloadJob.update({
    where: { id: DOWNLOAD_JOB_ID },
    data: {
      status: "processando",
      finishedAt: null,
      erroMsg: "",
    },
  });

  console.log(`Download items re-enfileirados: ${r.count} (sem par proc: ${semPar})`);
  console.log("Disparando Deemix no cloud2…");

  let total = 0;
  for (let round = 1; round <= 30; round++) {
    const proc = await triggerDownloadProcessing(15, { timeoutMs: 55_000 });
    const n = proc.processed ?? 0;
    total += n;
    console.log(`  rodada ${round}: processed=${n}`, proc.error ?? "");
    const pending = await prisma.downloadItem.count({
      where: { id: { in: [...dlIds] }, status: "aguardando" },
    });
    if (pending === 0) break;
    if (n === 0) break;
  }

  const ok = await prisma.downloadItem.count({
    where: { id: { in: [...dlIds] }, status: "concluido", storageKey: { not: null } },
  });
  console.log(`\nDeemix: ${ok}/${dlIds.size} concluídos (processados nesta execução: ${total})`);
  console.log("Próximo passo: npm run criacao:recover-staging-servidor-up");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
