import { NextResponse } from "next/server";
import {
  parseSaleRowsBody,
  prepareOpenChargesEmail,
} from "@/lib/cobrancaAberta/prepareOpenChargesEmail";
import { COMPANY_NAME } from "@/lib/brand";
import { parseEmailAddresses } from "@/lib/format";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import { getValidAccessToken } from "@/lib/contaazul/session";

const MAX_BODY = 380_000;
const MAX_SUBJECT = 480;

export async function POST(request: Request) {
  if (!isOcSmtpConfigured()) {
    return NextResponse.json({ error: "smtp_not_configured" }, { status: 503 });
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "conta_azul_disconnected" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const fantasy =
    typeof body.fantasy === "string" ? body.fantasy.trim().slice(0, 420) : "Cliente";
  const cnpjRaw =
    typeof body.cnpj === "string"
      ? body.cnpj.trim()
      : typeof body.cnpj === "number"
        ? String(body.cnpj)
        : "";

  const parsedSales = parseSaleRowsBody(body.sales);
  if ("error" in parsedSales) {
    return NextResponse.json({ error: parsedSales.error }, { status: 400 });
  }

  const emailRaw = typeof body.emailRaw === "string" ? body.emailRaw : "";
  const to = parseEmailAddresses(emailRaw);
  if (!to.length) {
    return NextResponse.json({ error: "missing_recipient_emails" }, { status: 400 });
  }

  const hasSubjectKey = Object.hasOwn(body, "subject") && typeof body.subject === "string";
  const hasBodyKey = Object.hasOwn(body, "bodyPlain") && typeof body.bodyPlain === "string";
  /** Envio antigo: só `emailRaw` + `sales`. Novo: sempre `subject` + `bodyPlain` (pré-visualização). */
  const useOverrides = hasSubjectKey && hasBodyKey;

  const subjectCandidate = hasSubjectKey
    ? String(body.subject).trim().slice(0, MAX_SUBJECT)
    : "";
  const bodyPlainStr = hasBodyKey ? String(body.bodyPlain) : "";
  const bodyCandidate =
    hasBodyKey && bodyPlainStr.length > MAX_BODY
      ? bodyPlainStr.slice(0, MAX_BODY)
      : bodyPlainStr;

  if (!clientId || !cnpjRaw) {
    return NextResponse.json({ error: "missing_client_identity" }, { status: 400 });
  }

  try {
    const prepared = await prepareOpenChargesEmail({
      token,
      clientId,
      fantasy,
      cnpjRaw,
      emailRaw,
      sales: parsedSales,
      subjectOverride: useOverrides ? subjectCandidate : undefined,
      bodyOverride: useOverrides ? bodyCandidate : undefined,
    });

    const { bodyPlain, html, subject, attachments } = prepared;

    await sendEmailViaSmtp({
      to: prepared.to,
      subject: subject || `${COMPANY_NAME} — cobranças em aberto`,
      text: bodyPlain,
      html,
      attachments,
    });

    return NextResponse.json({
      ok: true,
      recipients: prepared.to,
      pdfAttachments: attachments.length,
      hadAttachmentGaps: prepared.linkLines.length > 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed";
    const status =
      msg === "missing_recipient_emails" ||
      msg === "missing_client_identity" ||
      msg === "sales_empty" ||
      msg.startsWith("bad_sale")
        ? 400
        : msg === "SMTP não configurado: defina OC_EMAIL_SMTP_* e OC_EMAIL_FROM no ambiente"
          ? 503
          : 400;

    return NextResponse.json({ error: msg }, { status });
  }
}
