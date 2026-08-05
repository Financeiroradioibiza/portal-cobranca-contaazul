import { normalizeMetaForDedupe, normalizeTitleForDedupe } from "@/lib/criacao/dedupeNormalize";
import {
  buildBibliotecaMetadataIndex,
  findBibliotecaMetadataHit,
  findBibliotecaMetadataSuggest,
} from "@/lib/criacao/servidorUpMetadataDedupe";
import { prisma } from "@/lib/prisma";

export type ServidorUpDedupeTrackInput = {
  relativePath: string;
  artista: string;
  titulo: string;
  durationSec?: number | null;
  contentHash?: string | null;
  chromaprint?: string | null;
  isrc?: string | null;
};

export type ServidorUpDedupeStatus = "needs_deezer" | "in_biblioteca" | "suggest_metadata";

export type ServidorUpDedupeVia = "content_hash" | "chromaprint" | "isrc" | "metadata";

export type ServidorUpDedupeRow = {
  relativePath: string;
  status: ServidorUpDedupeStatus;
  via?: ServidorUpDedupeVia;
  musicaId?: string;
  musicaArtista?: string;
  musicaTitulo?: string;
};

export type ServidorUpDedupeBatchResult = {
  rows: ServidorUpDedupeRow[];
  stats: {
    total: number;
    inBiblioteca: number;
    suggestMetadata: number;
    needsDeezer: number;
  };
};

const ACTIVE_STATUSES = ["pronta", "processando"] as const;

type BibRow = {
  id: string;
  artista: string;
  titulo: string;
  contentHash: string | null;
  chromaprint: string | null;
  isrc: string | null;
  durationMs: number | null;
};

async function loadBibliotecaIndex(): Promise<{
  byHash: Map<string, BibRow>;
  byChromaprint: Map<string, BibRow>;
  byIsrc: Map<string, BibRow>;
  metadataIndex: ReturnType<typeof buildBibliotecaMetadataIndex>;
}> {
  const rows = await prisma.musicaBiblioteca.findMany({
    where: { status: { in: [...ACTIVE_STATUSES] } },
    select: {
      id: true,
      artista: true,
      titulo: true,
      contentHash: true,
      chromaprint: true,
      isrc: true,
      durationMs: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const byHash = new Map<string, BibRow>();
  const byChromaprint = new Map<string, BibRow>();
  const byIsrc = new Map<string, BibRow>();

  for (const row of rows) {
    const hash = row.contentHash?.trim();
    if (hash && !byHash.has(hash)) byHash.set(hash, row);

    const fp = row.chromaprint?.trim();
    if (fp && fp.length > 20 && !byChromaprint.has(fp)) byChromaprint.set(fp, row);

    const isrc = row.isrc?.trim().toUpperCase();
    if (isrc && !byIsrc.has(isrc)) byIsrc.set(isrc, row);
  }

  return {
    byHash,
    byChromaprint,
    byIsrc,
    metadataIndex: buildBibliotecaMetadataIndex(rows),
  };
}

function rowFromBib(
  track: ServidorUpDedupeTrackInput,
  bib: Pick<BibRow, "id" | "artista" | "titulo">,
  status: ServidorUpDedupeStatus,
  via: ServidorUpDedupeVia,
): ServidorUpDedupeRow {
  return {
    relativePath: track.relativePath,
    status,
    via,
    musicaId: bib.id,
    musicaArtista: bib.artista,
    musicaTitulo: bib.titulo,
  };
}

/** Lookup em lote — hash/chromaprint/isrc = forte; metadata = fuzzy (cloud2). */
export async function batchServidorUpDedupeCheck(
  tracks: ServidorUpDedupeTrackInput[],
): Promise<ServidorUpDedupeBatchResult> {
  const index = await loadBibliotecaIndex();
  const rows: ServidorUpDedupeRow[] = [];
  let inBiblioteca = 0;
  let suggestMetadata = 0;
  let needsDeezer = 0;

  for (const track of tracks) {
    const hash = track.contentHash?.trim();
    if (hash) {
      const hit = index.byHash.get(hash);
      if (hit) {
        rows.push(rowFromBib(track, hit, "in_biblioteca", "content_hash"));
        inBiblioteca++;
        continue;
      }
    }

    const isrc = track.isrc?.trim().toUpperCase();
    if (isrc) {
      const hit = index.byIsrc.get(isrc);
      if (hit) {
        rows.push(rowFromBib(track, hit, "in_biblioteca", "isrc"));
        inBiblioteca++;
        continue;
      }
    }

    const fp = track.chromaprint?.trim();
    if (fp && fp.length > 20) {
      const hit = index.byChromaprint.get(fp);
      if (hit) {
        rows.push(rowFromBib(track, hit, "in_biblioteca", "chromaprint"));
        inBiblioteca++;
        continue;
      }
    }

    const metaHit = findBibliotecaMetadataHit(
      track.artista,
      track.titulo,
      track.durationSec,
      index.metadataIndex,
    );
    if (metaHit) {
      rows.push(rowFromBib(track, metaHit, "in_biblioteca", "metadata"));
      inBiblioteca++;
      continue;
    }

    const suggest = findBibliotecaMetadataSuggest(
      track.artista,
      track.titulo,
      track.durationSec,
      index.metadataIndex,
    );
    if (suggest) {
      rows.push(rowFromBib(track, suggest, "suggest_metadata", "metadata"));
      suggestMetadata++;
      continue;
    }

    rows.push({ relativePath: track.relativePath, status: "needs_deezer" });
    needsDeezer++;
  }

  return {
    rows,
    stats: { total: tracks.length, inBiblioteca, suggestMetadata, needsDeezer },
  };
}

/** Export para testes / logs. */
export { normalizeMetaForDedupe, normalizeTitleForDedupe };
