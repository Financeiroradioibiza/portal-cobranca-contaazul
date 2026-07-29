import { prisma } from "@/lib/prisma";
import {
  appendDownloadJobItems,
  createDownloadJob,
  triggerDownloadProcessing,
} from "@/lib/criacao/downloadService";
import { buildStagingPreviewUrl, streamEnabled } from "@/lib/criacao/streamUrl";

export const SERVIDOR_UP_PREVIEW_JOB_TITULO = "Servidor UP — preview check";

export type PreviewCompareStartResult = {
  previewJobId: string;
  downloadItemId: string;
  status: string;
  stagingPreviewUrl: string | null;
  streamEnabled: boolean;
  erroMsg?: string;
};

export type PreviewCompareStatusResult = {
  status: string;
  stagingPreviewUrl: string | null;
  streamEnabled: boolean;
  erroMsg?: string;
};

function stagingPreviewForItem(item: {
  id: string;
  status: string;
  storageKey: string | null;
}): string | null {
  if (item.status !== "concluido") return null;
  if (!item.storageKey?.startsWith("download-staging:")) return null;
  return streamEnabled() ? buildStagingPreviewUrl(item.id) : null;
}

/** Enfileira 1 faixa Deemix para preview (job temporário reutilizável). */
export async function startServidorUpPreviewCompare(input: {
  deezerUrl: string;
  previewJobId?: string;
  criativoNome: string;
  criativoUserId?: string;
}): Promise<PreviewCompareStartResult> {
  const line = input.deezerUrl.trim();
  if (!line) throw new Error("deezer_url_obrigatoria");

  let previewJobId = (input.previewJobId ?? "").trim();
  let downloadItemId: string;

  if (previewJobId) {
    const appended = await appendDownloadJobItems({
      jobId: previewJobId,
      linhas: line,
    });
    previewJobId = appended.job.id;
    const last = await prisma.downloadItem.findFirst({
      where: { jobId: previewJobId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, storageKey: true, erroMsg: true },
    });
    if (!last) throw new Error("item_nao_criado");
    downloadItemId = last.id;

    if (last.status === "aguardando" || last.status === "processando") {
      await triggerDownloadProcessing(1, { timeoutMs: 45_000 });
    }

    return {
      previewJobId,
      downloadItemId,
      status: last.status,
      stagingPreviewUrl: stagingPreviewForItem(last),
      streamEnabled: streamEnabled(),
      erroMsg: last.erroMsg || undefined,
    };
  }

  const created = await createDownloadJob({
    provider: "deemix",
    titulo: SERVIDOR_UP_PREVIEW_JOB_TITULO,
    linhas: line,
    criativoNome: input.criativoNome,
    criativoUserId: input.criativoUserId,
  });
  previewJobId = created.job.id;
  const item = await prisma.downloadItem.findFirst({
    where: { jobId: previewJobId },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, storageKey: true, erroMsg: true },
  });
  if (!item) throw new Error("item_nao_criado");
  downloadItemId = item.id;

  if (item.status === "aguardando") {
    await triggerDownloadProcessing(1, { timeoutMs: 45_000 });
  }

  return {
    previewJobId,
    downloadItemId,
    status: item.status,
    stagingPreviewUrl: stagingPreviewForItem(item),
    streamEnabled: streamEnabled(),
    erroMsg: item.erroMsg || undefined,
  };
}

export async function getServidorUpPreviewCompareStatus(
  downloadItemId: string,
): Promise<PreviewCompareStatusResult | null> {
  const item = await prisma.downloadItem.findUnique({
    where: { id: downloadItemId },
    select: { id: true, status: true, storageKey: true, erroMsg: true },
  });
  if (!item) return null;
  return {
    status: item.status,
    stagingPreviewUrl: stagingPreviewForItem(item),
    streamEnabled: streamEnabled(),
    erroMsg: item.erroMsg || undefined,
  };
}
