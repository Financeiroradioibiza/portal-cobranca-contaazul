import { NextResponse } from "next/server";
import { replaceEnvioManualAgendamentos, appendEnvioManualLog } from "@/lib/enviosManuais/agendamentoStore";
import { fetchUpstashAgendamentos, fetchUpstashLogs } from "@/lib/enviosManuais/importFromUpstash";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";
import { enviosManuaisLiveEnabled } from "@/lib/enviosManuais/safeRecipients";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;

  const agendamentos = await fetchUpstashAgendamentos();
  if (!agendamentos.length) {
    return NextResponse.json(
      { ok: false, error: "upstash_empty_or_unconfigured", hint: "Defina KV_REST_API_URL e KV_REST_API_TOKEN no portal." },
      { status: 502 },
    );
  }
  const total = await replaceEnvioManualAgendamentos(agendamentos);

  const legacyLogs = await fetchUpstashLogs();
  for (const l of legacyLogs.slice(-100)) {
    await appendEnvioManualLog({
      client: l.client,
      emails: l.emails,
      ref: l.ref || "Importado do Upstash",
      ok: l.ok,
      aviso: l.aviso ?? null,
      sandbox: !enviosManuaisLiveEnabled(),
    });
  }

  return NextResponse.json({ ok: true, total, logsImported: legacyLogs.length });
}
