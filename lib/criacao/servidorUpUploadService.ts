import { prisma } from "@/lib/prisma";
import { pathSegmentLooseKey } from "@/lib/criacao/pathSanitize";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";
import type { UploadLoteInput } from "@/lib/criacao/filaService";
import { mixSegundosFromRelativePath } from "@/lib/criacao/legacyMixFilename";

export type ServidorUpUploadDraftInput = {
  uploadTag?: string;
  donoUserId?: string;
};

export type ServidorUpUploadTrackInput = {
  relativePath: string;
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
  deezerUrl: string;
};

export type ServidorUpUploadLotePreview = {
  hierarchyKey: string;
  clienteRef: string;
  clienteNome: string;
  programacaoId: string;
  programacaoNome: string;
  pastaId: string;
  pastaNome: string;
  uploadTagNome: string;
  tagCriativoUserId: string | null;
  tracks: Array<{
    relativePath: string;
    downloadItemId: string;
    titulo: string;
    artista: string;
    arquivoNome: string;
    sizeBytes: number | null;
  }>;
};

export type ServidorUpUploadPlan = {
  lotes: ServidorUpUploadLotePreview[];
  unmatchedTracks: string[];
  orphanDownloadItems: number;
  hierarchyErrors: string[];
};

export function deezerTrackIdFromUrl(url: string): string | null {
  const m = url.trim().match(/deezer\.com\/(?:\w+\/)?track\/(\d+)/i);
  return m?.[1] ?? null;
}

type DownloadItemRow = {
  id: string;
  linhaOriginal: string;
  titulo: string;
  artista: string;
  arquivoNome: string;
  sizeBytes: number | null;
};

function foldMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Artista/título a partir do nome do MP3 legado (`Artista - Faixa~7.mp3`). */
function legacyStemArtistTitle(relativePath: string): { artista: string; titulo: string } | null {
  const base = relativePath.split("/").pop()?.replace(/\.mp3$/i, "") ?? "";
  const stripped = base.replace(/~\d+$/i, "").trim();
  const sep = stripped.match(/^(.+?)\s*-\s*(.+)$/);
  if (!sep?.[1]?.trim() || !sep[2]?.trim()) return null;
  return { artista: sep[1].trim(), titulo: sep[2].trim() };
}

function resolveDownloadItemForTrack(
  track: ServidorUpUploadTrackInput,
  itemByTrackId: Map<string, DownloadItemRow>,
  items: DownloadItemRow[],
  usedDownloadIds: Set<string>,
): DownloadItemRow | undefined {
  const deezerId = deezerTrackIdFromUrl(track.deezerUrl);
  if (deezerId) {
    const hit = itemByTrackId.get(deezerId);
    if (hit && !usedDownloadIds.has(hit.id)) return hit;
  }

  for (const item of items) {
    if (usedDownloadIds.has(item.id)) continue;
    const fromLine = deezerTrackIdFromUrl(item.linhaOriginal);
    if (deezerId && fromLine === deezerId) return item;
  }

  const legacy = legacyStemArtistTitle(track.relativePath);
  if (!legacy) return undefined;
  const wantA = foldMatch(legacy.artista);
  const wantT = foldMatch(legacy.titulo);
  for (const item of items) {
    if (usedDownloadIds.has(item.id)) continue;
    const ia = foldMatch(item.artista);
    const it = foldMatch(item.titulo);
    if (ia === wantA && (it === wantT || it.includes(wantT) || wantT.includes(it))) return item;
  }
  return undefined;
}

export function servidorUpHierarchyKey(input: {
  clienteNome: string;
  programacaoNome: string;
  pastaNome: string;
}): string {
  return `${pathSegmentLooseKey(input.clienteNome)}/${pathSegmentLooseKey(input.programacaoNome)}/${pathSegmentLooseKey(input.pastaNome)}`;
}

function uploadTagForRow(
  row: ServidorUpHierarchyRow,
  draft: ServidorUpUploadDraftInput | undefined,
): string {
  return (draft?.uploadTag ?? "").trim() || row.suggestedUploadTag.trim() || row.pastaNome.trim();
}

export async function buildServidorUpUploadPlan(input: {
  downloadJobId: string;
  hierarchyRows: ServidorUpHierarchyRow[];
  drafts?: Record<string, ServidorUpUploadDraftInput>;
  tracks: ServidorUpUploadTrackInput[];
}): Promise<ServidorUpUploadPlan> {
  const hierarchyByKey = new Map(input.hierarchyRows.map((r) => [r.key, r]));
  const drafts = input.drafts ?? {};

  const downloadItems = await prisma.downloadItem.findMany({
    where: {
      jobId: input.downloadJobId,
      status: "concluido",
      storageKey: { not: null },
      NOT: { providerRef: { startsWith: "import:" } },
    },
    select: {
      id: true,
      linhaOriginal: true,
      titulo: true,
      artista: true,
      arquivoNome: true,
      sizeBytes: true,
    },
  });

  const itemByTrackId = new Map<string, (typeof downloadItems)[0]>();
  for (const item of downloadItems) {
    const trackId = deezerTrackIdFromUrl(item.linhaOriginal);
    if (trackId && !itemByTrackId.has(trackId)) itemByTrackId.set(trackId, item);
  }

  const loteMap = new Map<string, ServidorUpUploadLotePreview>();
  const unmatchedTracks: string[] = [];
  const hierarchyErrors: string[] = [];
  const usedDownloadIds = new Set<string>();

  for (const track of input.tracks) {
    const key = servidorUpHierarchyKey(track);
    const hierarchy = hierarchyByKey.get(key);
    if (!hierarchy) {
      unmatchedTracks.push(`${track.relativePath} (pasta não encontrada no passo 0)`);
      continue;
    }
    if (hierarchy.status !== "ok" || !hierarchy.clienteRef || !hierarchy.programacaoId || !hierarchy.pastaId) {
      hierarchyErrors.push(
        `${hierarchy.clienteNome} / ${hierarchy.programacaoNome} / ${hierarchy.pastaNome} — ${hierarchy.status}`,
      );
      continue;
    }

    const dl = resolveDownloadItemForTrack(track, itemByTrackId, downloadItems, usedDownloadIds);
    if (!dl) {
      unmatchedTracks.push(
        `${track.relativePath} (MP3 não encontrado no job ${input.downloadJobId.slice(0, 8)}… — confira se escolheu o snapshot deste job no Download link)`,
      );
      continue;
    }
    usedDownloadIds.add(dl.id);

    let lote = loteMap.get(key);
    if (!lote) {
      lote = {
        hierarchyKey: key,
        clienteRef: hierarchy.clienteRef,
        clienteNome: hierarchy.clienteNome,
        programacaoId: hierarchy.programacaoId,
        programacaoNome: hierarchy.programacaoNome,
        pastaId: hierarchy.pastaId,
        pastaNome: hierarchy.pastaNome,
        uploadTagNome: uploadTagForRow(hierarchy, drafts[key]),
        tagCriativoUserId: drafts[key]?.donoUserId?.trim() || hierarchy.criativoUserId,
        tracks: [],
      };
      loteMap.set(key, lote);
    }

    lote.tracks.push({
      relativePath: track.relativePath,
      downloadItemId: dl.id,
      titulo: dl.titulo,
      artista: dl.artista,
      arquivoNome: dl.arquivoNome,
      sizeBytes: dl.sizeBytes,
    });
  }

  const orphanDownloadItems = downloadItems.filter((i) => !usedDownloadIds.has(i.id)).length;

  const lotes = [...loteMap.values()].sort((a, b) => {
    const pa = `${a.clienteNome}/${a.programacaoNome}/${a.pastaNome}`;
    const pb = `${b.clienteNome}/${b.programacaoNome}/${b.pastaNome}`;
    return pa.localeCompare(pb, "pt-BR");
  });

  return { lotes, unmatchedTracks, orphanDownloadItems, hierarchyErrors: [...new Set(hierarchyErrors)] };
}

export function servidorUpPlanToUploadLotes(
  plan: ServidorUpUploadPlan,
  titulo: string,
): UploadLoteInput[] {
  return plan.lotes
    .filter((l) => l.tracks.length > 0)
    .map((l) => ({
      titulo: `${titulo} · ${l.pastaNome}`.slice(0, 200),
      destinoTipo: "pasta" as const,
      clienteRef: l.clienteRef,
      clienteNome: l.clienteNome,
      programacaoId: l.programacaoId,
      pastaId: l.pastaId,
      uploadTagNome: l.uploadTagNome,
      criativoUserId: l.tagCriativoUserId ?? undefined,
      arquivos: l.tracks.map((t) => {
        const mix = mixSegundosFromRelativePath(t.relativePath);
        return {
          nome: "",
          downloadItemId: t.downloadItemId,
          sizeBytes: t.sizeBytes ?? undefined,
          ...(mix != null ? { mixSegundosFromLegacy: mix } : {}),
        };
      }),
    }));
}
