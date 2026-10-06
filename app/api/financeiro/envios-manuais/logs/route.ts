import { NextResponse } from "next/server";
import { listEnvioManualLogs } from "@/lib/enviosManuais/agendamentoStore";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;
  const logs = await listEnvioManualLogs();
  return NextResponse.json({ ok: true, logs });
}
