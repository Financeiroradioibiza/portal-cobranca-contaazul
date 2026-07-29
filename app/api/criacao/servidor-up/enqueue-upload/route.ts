import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { CRIACAO_INGEST_URL, ingestEnabled } from "@/lib/criacao/ingestTicket";
import {
  enqueueServidorUpFilaChunk,
  SERVIDOR_UP_ENQUEUE_LOTE_CHUNK,
  type ServidorUpEnqueueChunkInput,
} from "@/lib/criacao/servidorUpEnqueueFilaService";
import type { ServidorUpHierarchyRow } from "@/lib/criacao/servidorUpHierarchyService";
import type { ServidorUpUploadDraftInput, ServidorUpUploadTrackInput } from "@/lib/criacao/servidorUpUploadService";
import {
  getServidorUpUploadSnapshot,
  saveServidorUpUploadSnapshot,
} from "@/lib/criacao/servidorUpUploadSnapshotService";
import type { ServidorUpUploadSessionMeta } from "@/lib/criacao/servidorUpEnqueueFilaService";
import type { ServidorUpUploadSession } from "@/lib/criacao/servidorUpUploadSession";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!ingestEnabled()) {
      return NextResponse.json({ error: "ingest_desabilitado" }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      downloadJobId?: string;
      titulo?: string;
      hierarchyRows?: ServidorUpHierarchyRow[];
      drafts?: Record<string, ServidorUpUploadDraftInput>;
      tracks?: ServidorUpUploadTrackInput[];
      loteOffset?: number;
      loteLimit?: number;
      markAutoEnqueue?: boolean;
    };

    const downloadJobId = (body.downloadJobId ?? "").trim();
    const hierarchyRows = Array.isArray(body.hierarchyRows) ? body.hierarchyRows : [];
    const tracks = Array.isArray(body.tracks) ? body.tracks : [];
    const titulo = (body.titulo ?? "Servidor UP — migração legado").slice(0, 200);

    if (!downloadJobId) {
      return NextResponse.json({ error: "download_job_obrigatorio" }, { status: 400 });
    }
    if (tracks.length === 0) {
      return NextResponse.json({ error: "tracks_vazios" }, { status: 400 });
    }

    const input: ServidorUpEnqueueChunkInput = {
      downloadJobId,
      titulo,
      hierarchyRows,
      drafts: body.drafts,
      tracks,
      uploaderEmail: session.email,
      uploaderDisplayName: session.displayName ?? session.email,
      loteOffset: body.loteOffset,
      loteLimit: body.loteLimit ?? SERVIDOR_UP_ENQUEUE_LOTE_CHUNK,
    };

    const result = await enqueueServidorUpFilaChunk(input);

    if (body.markAutoEnqueue !== false) {
      const existing = (await getServidorUpUploadSnapshot(downloadJobId)) as ServidorUpUploadSessionMeta | null;
      const prev = existing?.filaEnqueue;
      const nextFila: ServidorUpUploadSessionMeta["filaEnqueue"] = {
        jobIds: [...(prev?.jobIds ?? []), ...result.jobIds],
        lotesDone: result.lotesProcessed,
        lotesTotal: result.lotesTotal,
        tracksImported: (prev?.tracksImported ?? 0) + result.tracksImported,
        startedAt: prev?.startedAt ?? Date.now(),
        finishedAt: result.done && result.ok ? Date.now() : prev?.finishedAt,
        lastError: result.ok ? null : result.error ?? result.messages?.[0] ?? "erro",
      };
      const merged = {
        ...(existing ?? {
          downloadJobId,
          titulo,
          hierarchyRows,
          drafts: body.drafts ?? {},
          tracks,
          savedAt: Date.now(),
        }),
        autoEnqueueFila: true,
        enqueuedByEmail: session.email,
        enqueuedByDisplayName: session.displayName ?? session.email,
        filaEnqueue: nextFila,
        savedAt: Date.now(),
      };
      await saveServidorUpUploadSnapshot(downloadJobId, merged as ServidorUpUploadSession);
    }

    if (!result.ok) {
      const status =
        result.error === "hierarquia_incompleta" ? 409
        : result.error === "programacao_sem_dono" ? 409
        : result.error === "nenhuma_faixa_mapeada" ? 400
        : result.error === "staging_import_falhou" ? 502
        : result.error === "staging_item_invalido" ? 400
        : 500;
      return NextResponse.json(
        {
          error: result.error,
          message: result.messages?.join(" · "),
          messages: result.messages,
          unmatched: result.unmatched,
          ok: false,
          stagingImported: result.tracksImported,
          stagingErrors: result.stagingErrors,
          jobIds: result.jobIds,
          done: result.done,
          lotesTotal: result.lotesTotal,
          lotesProcessed: result.lotesProcessed,
          lotesRemaining: result.lotesRemaining,
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      ingestUrl: CRIACAO_INGEST_URL,
      stagingImported: result.tracksImported,
      stagingErrors: result.stagingErrors,
      jobIds: result.jobIds,
      done: result.done,
      lotesTotal: result.lotesTotal,
      lotesProcessed: result.lotesProcessed,
      lotesRemaining: result.lotesRemaining,
      stats: {
        lotes: result.lotesProcessed,
        lotesTotal: result.lotesTotal,
        lotesRemaining: result.lotesRemaining,
        tracks: result.tracksImported,
        unmatched: result.unmatched.length,
      },
      unmatched: result.unmatched,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "staging_item_invalido") {
      return NextResponse.json({ error: "staging_item_invalido" }, { status: 400 });
    }
    console.error("[criacao/servidor-up/enqueue-upload POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
