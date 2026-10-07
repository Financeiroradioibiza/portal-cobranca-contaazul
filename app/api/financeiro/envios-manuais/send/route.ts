import { NextResponse } from "next/server";
import { appendEnvioManualLog, listEnvioManualAgendamentos } from "@/lib/enviosManuais/agendamentoStore";
import { dispatchEnvioManualAgendamento } from "@/lib/enviosManuais/envioManualDispatch";
import { requireFinanceiroCaSession } from "@/lib/enviosManuais/requireFinanceiroApi";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireFinanceiroCaSession();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const agendamentoId = typeof body.agendamentoId === "string" ? body.agendamentoId.trim() : "";
  const modeRaw = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "test";
  const mode = modeRaw === "live" ? "live" : "test";
  if (!agendamentoId) {
    return NextResponse.json({ ok: false, error: "missing_agendamento_id" }, { status: 400 });
  }

  const row = (await listEnvioManualAgendamentos()).find((a) => a.id === agendamentoId);
  if (!row) {
    return NextResponse.json({ ok: false, error: "agendamento_not_found" }, { status: 404 });
  }

  try {
    const result = await dispatchEnvioManualAgendamento(auth.token, row, {
      refAutomatico: mode === "live" ? "Envio manual (portal)" : "Teste (portal)",
      delivery: mode,
      markSent: mode === "live",
    });
    return NextResponse.json({
      ok: true,
      sandbox: result.sandbox,
      recipients: result.recipients,
      originalRecipients: result.originalRecipients,
      pdfAttachments: result.pdfAttachments,
      danfseAttached: result.danfseAttached,
      attachmentFilenames: result.attachmentFilenames,
      danfseSkipReason: result.danfseSkipReason ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed";
    await appendEnvioManualLog({
      client: row.client,
      emails: row.emails.join(", "),
      ref: "Falha no envio",
      ok: false,
      aviso: msg.slice(0, 480),
      sandbox: true,
    });
    const status =
      msg === "smtp_not_configured" ? 503
      : msg === "no_parcelas_for_client" || msg === "missing_client_cnpj" || msg === "missing_emails" ? 400
      : 502;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
