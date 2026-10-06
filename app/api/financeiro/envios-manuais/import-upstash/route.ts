import { NextResponse } from "next/server";
import { replaceEnvioManualAgendamentos, appendEnvioManualLog } from "@/lib/enviosManuais/agendamentoStore";
import { fetchUpstashAgendamentosDetailed, fetchUpstashLogs } from "@/lib/enviosManuais/importFromUpstash";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";
import { enviosManuaisLiveEnabled } from "@/lib/enviosManuais/safeRecipients";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;

  const upstash = await fetchUpstashAgendamentosDetailed();
  if (upstash.kind === "unconfigured") {
    return NextResponse.json(
      {
        ok: false,
        error: "upstash_unconfigured",
        hint: "No Netlify (portal), adicione KV_REST_API_URL e KV_REST_API_TOKEN (copie do projeto Vercel radioibiza) e redeploy. Ou use Importar JSON.",
      },
      { status: 502 },
    );
  }
  if (upstash.kind === "empty") {
    return NextResponse.json(
      {
        ok: false,
        error: "upstash_empty",
        hint: "Upstash respondeu, mas a chave agendamentos está vazia. Use Importar JSON exportado do painel Vercel.",
      },
      { status: 502 },
    );
  }
  const total = await replaceEnvioManualAgendamentos(upstash.agendamentos);

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
