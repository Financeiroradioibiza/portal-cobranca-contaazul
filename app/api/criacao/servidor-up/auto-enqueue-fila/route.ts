import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  runAutoEnqueueForSnapshot,
  SERVIDOR_UP_MAX_TRACKS_PER_CHUNK,
} from "@/lib/criacao/servidorUpEnqueueFilaService";

export const maxDuration = 120;

/** Enfileira próximo chunk na fila (auto ou manual) para um job Deemix do Servidor UP. */
export async function POST(request: Request) {
  try {
    requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      downloadJobId?: string;
      maxChunks?: number;
    };
    const downloadJobId = (body.downloadJobId ?? "").trim();
    if (!downloadJobId) {
      return NextResponse.json({ error: "download_job_obrigatorio" }, { status: 400 });
    }

    const maxChunks = Math.min(20, Math.max(1, body.maxChunks ?? 12));
    const chunks: Awaited<ReturnType<typeof runAutoEnqueueForSnapshot>>[] = [];
    let totalTracks = 0;

    for (let i = 0; i < maxChunks; i++) {
      const r = await runAutoEnqueueForSnapshot(downloadJobId);
      if (!r) {
        if (i === 0) {
          return NextResponse.json({
            ok: false,
            error: "nao_pronto",
            message:
              "Download ainda em andamento, snapshot ausente, auto-enfileirar desligado ou fila já concluída.",
          });
        }
        break;
      }
      chunks.push(r);
      totalTracks += r.tracksImported;
      if (!r.ok || r.done) break;
    }

    const last = chunks[chunks.length - 1];
    if (!last) {
      return NextResponse.json({ ok: false, error: "nao_pronto" }, { status: 409 });
    }

    if (!last.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: last.error,
          message: last.messages?.join(" · "),
          chunks: chunks.length,
          totalTracks,
        },
        { status: last.error === "hierarquia_incompleta" ? 409 : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      done: last.done,
      chunks: chunks.length,
      totalTracks,
      lotesRemaining: last.lotesRemaining,
      lotesTotal: last.lotesTotal,
      chunkSize: SERVIDOR_UP_MAX_TRACKS_PER_CHUNK,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/auto-enqueue-fila POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
