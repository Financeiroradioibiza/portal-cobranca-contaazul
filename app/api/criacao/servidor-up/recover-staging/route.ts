import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { authorizeOcAutoDispatchCron } from "@/lib/manualReminders/ocAutoDispatchAuth";
import {
  recoverServidorUpStagingAll,
  recoverServidorUpStagingForDownloadJob,
} from "@/lib/criacao/servidorUpRecoverStagingService";

export const maxDuration = 120;

/**
 * Copia MP3 do Deemix (download-staging) para o cloud2 nos jobs já enfileirados.
 * Use quando a fila foi criada mas ingest-from-staging falhou (ex.: sem secret local).
 */
async function handle(request: Request) {
  const cronAuth = authorizeOcAutoDispatchCron(request);
  if (!cronAuth.ok) {
    try {
      requirePortalSession(await getPortalSession());
    } catch (e) {
      if (e instanceof Response) return e;
      return cronAuth.response;
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    downloadJobId?: string;
    all?: boolean;
    maxItems?: number;
    maxJobs?: number;
  };

  if (body.all) {
    const result = await recoverServidorUpStagingAll({
      maxItems: body.maxItems,
      maxJobs: body.maxJobs,
    });
    return NextResponse.json({ ok: result.imported > 0 || result.errors.length === 0, ...result });
  }

  const downloadJobId = (body.downloadJobId ?? "").trim();
  if (!downloadJobId) {
    return NextResponse.json({ error: "download_job_obrigatorio" }, { status: 400 });
  }

  const result = await recoverServidorUpStagingForDownloadJob(downloadJobId, {
    maxItems: body.maxItems,
  });
  if (!result.ok && result.imported === 0) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    console.error("[criacao/servidor-up/recover-staging POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
