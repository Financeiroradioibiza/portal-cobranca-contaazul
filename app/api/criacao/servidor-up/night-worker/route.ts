import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { authorizeOcAutoDispatchCron } from "@/lib/manualReminders/ocAutoDispatchAuth";
import { runServidorUpNightWorker } from "@/lib/criacao/servidorUpEnqueueFilaService";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Worker noturno Servidor UP: mantém Deemix baixando + envia snapshots prontos para a fila.
 *
 * Cron (Netlify / externo): GET ou POST com Authorization: Bearer <CRON_SECRET>
 * Intervalo sugerido: a cada 5 min enquanto migração em massa.
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

  const url = new URL(request.url);
  const downloadLimit = Number(url.searchParams.get("downloadLimit") ?? "20") || 20;
  const downloadJobId = (url.searchParams.get("downloadJobId") ?? "").trim();
  const envJobId = (process.env.SERVIDOR_UP_NIGHT_WORKER_JOB_ID ?? "").trim();
  const jobFilter = downloadJobId || envJobId;

  const result = await runServidorUpNightWorker({
    downloadLimit,
    maxSnapshots: 20,
    downloadJobIds: jobFilter ? [jobFilter] : undefined,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    console.error("[criacao/servidor-up/night-worker GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    console.error("[criacao/servidor-up/night-worker POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
