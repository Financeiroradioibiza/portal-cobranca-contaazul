import { NextResponse } from "next/server";
import {
  parseSaleRowsBody,
  prepareOpenChargesEmail,
} from "@/lib/cobrancaAberta/prepareOpenChargesEmail";
import { getValidAccessToken } from "@/lib/contaazul/session";

export async function POST(request: Request) {
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

  const emailRaw =
    typeof body.emailRaw === "string"
      ? body.emailRaw.trim()
      : "";

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
    });

    return NextResponse.json({
      ok: true,
      subject: prepared.subject,
      bodyPlain: prepared.bodyPlain,
      htmlPreview: prepared.html,
      recipients: prepared.to,
      pdfAttachments: prepared.attachments.length,
      hadAttachmentGaps: prepared.linkLines.length > 0,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "compose_failed";
    if (code === "missing_recipient_emails") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
