import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import {
  recoverServidorUpMissingTracks,
  recoverServidorUpMissingTracksAll,
} from "@/lib/criacao/servidorUpRecoverMissingService";

export const maxDuration = 120;

/** Recupera faixas do Servidor UP que ficaram de fora por falha de pareamento MP3. */
export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      downloadJobId?: string;
      dryRun?: boolean;
      all?: boolean;
      maxRounds?: number;
    };
    const downloadJobId = (body.downloadJobId ?? "").trim();
    if (!downloadJobId) {
      return NextResponse.json({ error: "download_job_obrigatorio" }, { status: 400 });
    }

    const fn =
      body.all ?
        () =>
          recoverServidorUpMissingTracksAll(downloadJobId, {
            maxRounds: body.maxRounds,
            uploaderEmail: session.email,
            uploaderDisplayName: session.displayName ?? session.email,
          })
      : () =>
          recoverServidorUpMissingTracks(downloadJobId, {
            dryRun: body.dryRun,
            uploaderEmail: session.email,
            uploaderDisplayName: session.displayName ?? session.email,
          });

    const result = await fn();
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "hierarquia_incompleta" ? 409 : 502 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/servidor-up/recover-missing POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
