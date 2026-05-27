import { NextResponse } from "next/server";
import { ManualReminderRowStatus } from "@prisma/client";
import { isOcSmtpConfigured } from "@/lib/email/ocSmtp";
import { transmitOcReminderSmtp } from "@/lib/manualReminders/ocReminderSend";
import type { OcRowWithMonth } from "@/lib/manualReminders/ocReminderSend";
import { parseOcEmailRecipients } from "@/lib/manualReminders/ocEmailRender";
import { manualReminderLinhaComMesApiSelect } from "@/lib/manualReminders/manualLinhaApiSelect";
import { prisma } from "@/lib/prisma";

function validRowId(id: string): boolean {
  if (!id || id.length > 140) return false;
  return /^c[a-z0-9]+$|^[a-z0-9]{20,}$/.test(id);
}

/**
 * Envia o e-mail de pedido de OC para os endereços da linha (`emailCobranca`), usando SMTP (Locaweb).
 */
export async function POST(request: Request) {
  if (!isOcSmtpConfigured()) {
    return NextResponse.json(
      {
        error: "smtp_not_configured",
        message:
          "Configure OC_EMAIL_SMTP_HOST, OC_EMAIL_SMTP_USER, OC_EMAIL_SMTP_PASS e OC_EMAIL_FROM nas variáveis de ambiente (Locaweb). Veja .env.example.",
      },
      { status: 503 },
    );
  }

  let body: { rowId?: unknown; marcarSolicitadoOrdem?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rowId = typeof body.rowId === "string" ? body.rowId : "";
  if (!validRowId(rowId)) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }

  const marcar =
    body.marcarSolicitadoOrdem === undefined ? true : Boolean(body.marcarSolicitadoOrdem);

  const row = await prisma.manualReminderRow.findUnique({
    where: { id: rowId },
    select: manualReminderLinhaComMesApiSelect,
  });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (
    row.anexarListagemClientesOc &&
    !row.listagemClienteArquivoNome?.trim()
  ) {
    return NextResponse.json(
      {
        error: "oc_listagem_required",
        message:
          "Esta linha exige listagem/imagem mensal para o pedido OC. Envie um ficheiro na coluna «Arquivo» deste mês antes de disparar.",
      },
      { status: 400 },
    );
  }

  if (!parseOcEmailRecipients(row.emailCobranca ?? "").length) {
    return NextResponse.json(
      {
        error: "no_recipients",
        message:
          "Esta linha não tem e-mail de cobrança. Vincule no Conta Azul ou preencha o campo de e-mail manualmente.",
      },
      { status: 400 },
    );
  }

  let destinatarios: string[] = [];
  try {
    destinatarios = await transmitOcReminderSmtp(row as OcRowWithMonth);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "smtp_send_failed";
    return NextResponse.json({ error: "smtp_send_failed", message: msg.slice(0, 500) }, { status: 502 });
  }

  if (marcar) {
    await prisma.manualReminderRow.update({
      where: { id: row.id },
      data: { status: ManualReminderRowStatus.solicitado_ordem },
    });
  }

  return NextResponse.json({ ok: true, destinatarios, statusAtualizado: marcar });
}
