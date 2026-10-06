import { NextResponse } from "next/server";
import { authorizeOcAutoDispatchCron } from "@/lib/manualReminders/ocAutoDispatchAuth";
import { runEnvioManualCronBatch } from "@/lib/enviosManuais/envioManualCronService";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handleCron(request: Request) {
  const auth = authorizeOcAutoDispatchCron(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await runEnvioManualCronBatch();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cron_failed";
    const status =
      msg === "smtp_not_configured" || msg === "conta_azul_disconnected" ? 503
      : msg.includes("envio_manual") || msg.includes("does not exist") ? 503
      : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/** Cron externo (cron-job.org): Bearer CRON_SECRET ou OC_EMAIL_CRON_SECRET — GET ou POST. */
export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
