import { NextResponse } from "next/server";
import {
  appendEnvioManualLog,
  listEnvioManualAgendamentos,
  markAgendamentoSent,
} from "@/lib/enviosManuais/agendamentoStore";
import { sendEnvioManualGrupo, sendEnvioManualIndividual } from "@/lib/enviosManuais/envioManualSendService";
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
  if (!agendamentoId) {
    return NextResponse.json({ ok: false, error: "missing_agendamento_id" }, { status: 400 });
  }

  const all = await listEnvioManualAgendamentos();
  const row = all.find((a) => a.id === agendamentoId);
  if (!row) {
    return NextResponse.json({ ok: false, error: "agendamento_not_found" }, { status: 404 });
  }
  if (!row.emails.length) {
    return NextResponse.json({ ok: false, error: "missing_emails" }, { status: 400 });
  }

  try {
    let result;
    if (row.tipo === "grupo") {
      if (!row.grupoClientes?.length) {
        return NextResponse.json({ ok: false, error: "grupo_sem_clientes" }, { status: 400 });
      }
      result = await sendEnvioManualGrupo({
        token: auth.token,
        nomeGrupo: row.client,
        grupoClientes: row.grupoClientes,
        emails: row.emails,
        mensagemTemplate: row.msg,
      });
      await appendEnvioManualLog({
        client: `${row.client} [GRUPO]`,
        emails: row.emails.join(", "),
        ref: `${result.clientesOk}/${result.clientesTotal} clientes · ${result.pdfAttachments} PDF(s)`,
        ok: result.clientesOk > 0,
        aviso: result.hadAttachmentGaps ? "Alguns documentos só por link" : null,
        sandbox: result.sandbox,
      });
    } else {
      if (!row.clienteId) {
        return NextResponse.json({ ok: false, error: "missing_ca_cliente_id" }, { status: 400 });
      }
      result = await sendEnvioManualIndividual({
        token: auth.token,
        caClienteId: row.clienteId,
        clientLabel: row.client,
        emails: row.emails,
        mensagemTemplate: row.msg,
      });
      const semAnexo = result.pdfAttachments === 0;
      await appendEnvioManualLog({
        client: row.client,
        emails: row.emails.join(", "),
        ref: `Venda ${result.vendaNumero ?? "—"} · ${result.pdfAttachments} PDF(s)`,
        ok: !semAnexo,
        aviso: semAnexo ? "Enviado sem anexos PDF" : result.hadAttachmentGaps ? "Parte só por link" : null,
        sandbox: result.sandbox,
      });
    }

    await markAgendamentoSent(row.id);

    return NextResponse.json({
      ok: true,
      sandbox: result.sandbox,
      recipients: result.recipients,
      originalRecipients: result.originalRecipients,
      pdfAttachments: result.pdfAttachments,
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
      : msg === "no_parcelas_for_client" || msg === "missing_client_cnpj" ? 400
      : 502;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
