import { prisma } from "@/lib/prisma";
import { pickLowestPreviewFormato } from "@/lib/criacao/previewFormato";
import { cloud2Enabled, cloud2Fetch, parseCloud2Json } from "@/lib/criacao/cloud2Client";
import type { CheckVerdict } from "@/lib/criacao/checkLabels";
import { buildCheckPreviewUrl, buildPreviewUrl, streamEnabled } from "@/lib/criacao/streamUrl";
import { CRIACAO_INGEST_URL, ingestEnabled, signCheckUploadTicket } from "@/lib/criacao/ingestTicket";

export type { CheckVerdict } from "@/lib/criacao/checkLabels";

export type CheckResultRow = {
  fileId: string;
  arquivoNome: string;
  uploadArtista: string;
  uploadTitulo: string;
  durationMs: number | null;
  sizeBytes: number;
  matchedMusicaId: string | null;
  matchScore: number;
  verdict: CheckVerdict;
  checks: Array<{ id: string; ok: boolean; label: string; detail: string }>;
  uploadPreviewUrl: string | null;
  sistema: {
    musicaId: string;
    artista: string;
    titulo: string;
    durationMs: number | null;
    previewUrl: string | null;
  } | null;
};

export type CheckPastaTrackInput = {
  musicaId: string;
  artista: string;
  titulo: string;
  durationMs: number | null;
};

const CHECK_INGEST_URL = CRIACAO_INGEST_URL.replace(/\/ingest$/, "/check/ingest");

export function checkEnabled(): boolean {
  return ingestEnabled() && cloud2Enabled();
}

export async function createCheckSession(): Promise<string> {
  const res = await cloud2Fetch("/check/session", { method: "POST" });
  const data = await parseCloud2Json<{ ok?: boolean; sessionId?: string; error?: string }>(
    res,
    "check_session",
  );
  if (!res.ok || !data.sessionId) {
    throw new Error(data.error || "check_session_falhou");
  }
  return data.sessionId;
}

export function buildCheckUploadTicket(sessionId: string, fileId: string): { token: string; exp: number } {
  return signCheckUploadTicket(sessionId, fileId);
}

export function checkIngestUrl(): string {
  return CHECK_INGEST_URL;
}

export async function loadPastaTracksForCheck(pastaId: string): Promise<CheckPastaTrackInput[]> {
  const links = await prisma.pastaMusica.findMany({
    where: { pastaId },
    orderBy: { sortOrder: "asc" },
    include: {
      musica: {
        select: { id: true, titulo: true, artista: true, durationMs: true },
      },
    },
  });
  return links.map((l) => ({
    musicaId: l.musica.id,
    artista: l.musica.artista,
    titulo: l.musica.titulo,
    durationMs: l.musica.durationMs,
  }));
}

type Cloud2CheckResult = {
  fileId: string;
  arquivoNome: string;
  uploadArtista: string;
  uploadTitulo: string;
  durationMs: number | null;
  sizeBytes: number;
  matchedMusicaId: string | null;
  matchScore: number;
  verdict: CheckVerdict;
  checks: Array<{ id: string; ok: boolean; label: string; detail: string }>;
  sistemaArtista: string | null;
  sistemaTitulo: string | null;
  sistemaDurationMs: number | null;
};

export async function analyzeCheckSession(input: {
  sessionId: string;
  pastaTracks: CheckPastaTrackInput[];
  fileId?: string;
}): Promise<CheckResultRow[]> {
  const res = await cloud2Fetch("/check/analyze", {
    method: "POST",
    body: JSON.stringify({
      sessionId: input.sessionId,
      pastaTracks: input.pastaTracks,
      fileId: input.fileId?.trim() || undefined,
    }),
  });
  const data = await parseCloud2Json<{ ok?: boolean; results?: Cloud2CheckResult[]; error?: string }>(
    res,
    "check_analyze",
  );
  if (!res.ok || !Array.isArray(data.results)) {
    throw new Error(data.error || (res.status === 504 ? "check_analyze_timeout" : "check_analyze_falhou"));
  }

  return enrichCheckResults(data.results, input.sessionId);
}

async function enrichCheckResults(
  rows: Cloud2CheckResult[],
  sessionId: string,
): Promise<CheckResultRow[]> {
  const matchedIds = [...new Set(rows.map((r) => r.matchedMusicaId).filter(Boolean))] as string[];
  const musicas =
    matchedIds.length > 0
      ? await prisma.musicaBiblioteca.findMany({
          where: { id: { in: matchedIds } },
          select: {
            id: true,
            titulo: true,
            artista: true,
            durationMs: true,
            versoes: { select: { formato: true } },
          },
        })
      : [];
  const musicaById = new Map(musicas.map((m) => [m.id, m]));

  return rows.map((row) => {
    const musica = row.matchedMusicaId ? musicaById.get(row.matchedMusicaId) : null;
    const formato = musica ? pickLowestPreviewFormato(musica.versoes) : null;
    return {
      fileId: row.fileId,
      arquivoNome: row.arquivoNome,
      uploadArtista: row.uploadArtista,
      uploadTitulo: row.uploadTitulo,
      durationMs: row.durationMs,
      sizeBytes: row.sizeBytes,
      matchedMusicaId: row.matchedMusicaId,
      matchScore: row.matchScore,
      verdict: row.verdict,
      checks: row.checks,
      uploadPreviewUrl:
        streamEnabled() ? buildCheckPreviewUrl(sessionId, row.fileId) : null,
      sistema:
        musica && row.matchedMusicaId
          ? {
              musicaId: row.matchedMusicaId,
              artista: musica.artista,
              titulo: musica.titulo,
              durationMs: musica.durationMs,
              previewUrl:
                formato && streamEnabled() ? buildPreviewUrl(musica.id, formato) : null,
            }
          : null,
    };
  });
}

export async function deleteCheckSession(sessionId: string): Promise<void> {
  const res = await cloud2Fetch(`/check/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await parseCloud2Json<{ error?: string }>(res, "check_delete");
    throw new Error(data.error || "check_delete_falhou");
  }
}
