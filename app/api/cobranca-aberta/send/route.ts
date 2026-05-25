import { NextResponse } from "next/server";
import type { SaleRow } from "@/lib/types";
import { applyCobrancaAbertaPlaceholders } from "@/lib/cobrancaAberta/cobrancaAbertaEmailDefaults";
import { getOrCreateCobrancaAbertaEmailTemplate } from "@/lib/cobrancaAberta/cobrancaAbertaEmailTemplateService";
import { collectOpenChargesEmailAssets } from "@/lib/cobrancaAberta/collectOpenChargesEmailAssets";
import { COMPANY_NAME } from "@/lib/brand";
import { formatBRL, parseEmailAddresses } from "@/lib/format";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import { getValidAccessToken } from "@/lib/contaazul/session";

function buildDocumentosAppendix(args: {
  attachmentNames: string[];
  linkLines: string[];
}): string {
  const names = args.attachmentNames;
  const nameList =
    names.length > 0
      ? `Anexamos ${names.length} PDF(s): ${names.join(", ")}.`
      : "Não foi possível anexar PDFs automáticos (ver secção «Links», abaixo).";

  const htmlBoletoNote =
    "\nObservação — boletos Conta Azul (iugu): o portal tenta descarregar o PDF diretamente do servidor público `public.contaazul.com` (mesmo ficheiro do botão «Fazer download do boleto»), usando o identificador da cobrança que vem no link da fatura. " +
    "Se isso falhar ou o link for só a página HTML (Pix / escolher meio de pagamento), essa parcela fica como hiperligação abaixo — abrir no navegador e usar «Fazer download do boleto».\n";

  const linksBlock =
    args.linkLines.length > 0
      ? `\nLinks (abrir cada um no navegador)\n${args.linkLines.join("\n")}\n`
      : "\nTodos os PDFs recuperados foram anexados; não há mais links externos necessários neste envio.\n";

  return `${nameList}${htmlBoletoNote}${linksBlock}`;
}

function parseSaleRows(raw: unknown): SaleRow[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "sales_not_array" };
  const out: SaleRow[] = [];
  let i = 0;
  for (const x of raw) {
    i++;
    if (typeof x !== "object" || x === null) return { error: `bad_sale@${i}` };
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const comp = typeof r.comp === "string" ? r.comp.trim() : "";
    const due = typeof r.due === "string" ? r.due.trim() : "";
    const summary = typeof r.summary === "string" ? r.summary.trim() : "";
    const value = typeof r.value === "number" && Number.isFinite(r.value) ? r.value : NaN;
    if (!id || !comp || !due || Number.isNaN(value)) return { error: `bad_sale_fields@${i}` };
    out.push({ id, comp, due, summary, value });
  }
  if (!out.length) return { error: "sales_empty" };
  return out;
}

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

  const parsedSales = parseSaleRows(body.sales);
  if ("error" in parsedSales) {
    return NextResponse.json({ error: parsedSales.error }, { status: 400 });
  }

  const to = parseEmailAddresses(typeof body.emailRaw === "string" ? body.emailRaw : "");
  if (!to.length) {
    return NextResponse.json({ error: "missing_recipient_emails" }, { status: 400 });
  }
  if (!clientId || !cnpjRaw) {
    return NextResponse.json({ error: "missing_client_identity" }, { status: 400 });
  }

  let tpl;
  try {
    tpl = await getOrCreateCobrancaAbertaEmailTemplate();
  } catch {
    return NextResponse.json({ error: "template_error" }, { status: 500 });
  }

  const totalNum = parsedSales.reduce((s, x) => s + x.value, 0);
  const tabela = parsedSales
    .map(
      (x) =>
        `- ${x.comp} | Vencimento: ${x.due} | ${x.summary || "—"} | ${formatBRL(x.value)}`,
    )
    .join("\n");

  try {
    const bundle = await collectOpenChargesEmailAssets(token, clientId, parsedSales);
    const appendix = buildDocumentosAppendix({
      attachmentNames: bundle.attachments.map((a) => a.filename),
      linkLines: bundle.linkLines,
    });

    const vars: Record<string, string> = {
      CLIENTE: fantasy,
      MARCA: COMPANY_NAME,
      CNPJ: cnpjRaw,
      TABELA_PARCELAS: tabela,
      TOTAL: formatBRL(totalNum),
      DOCUMENTOS: appendix,
    };

    const subject = applyCobrancaAbertaPlaceholders(tpl.subject, vars).trim().slice(0, 480);
    const textBody = applyCobrancaAbertaPlaceholders(tpl.bodyText, vars);

    await sendEmailViaSmtp({
      to,
      subject: subject || `${COMPANY_NAME} — cobranças em aberto`,
      text: textBody,
      attachments: bundle.attachments,
    });

    return NextResponse.json({
      ok: true,
      recipients: to,
      pdfAttachments: bundle.attachments.length,
      linksListed: bundle.linkLines.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
