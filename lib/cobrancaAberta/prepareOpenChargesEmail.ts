import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { COMPANY_NAME } from "@/lib/brand";
import { formatBRL, parseEmailAddresses } from "@/lib/format";
import type { SaleRow } from "@/lib/types";
import { applyCobrancaAbertaPlaceholders } from "./cobrancaAbertaEmailDefaults";
import { getOrCreateCobrancaAbertaEmailTemplate } from "./cobrancaAbertaEmailTemplateService";
import { buildCobrancaAbertaEmailHtml } from "./cobrancaAbertaHtml";
import { collectOpenChargesEmailAssets } from "./collectOpenChargesEmailAssets";
import { parcelaLinhaCsvParaEmail } from "./parcelaLinhaEmail";

export function parseSaleRowsBody(raw: unknown): SaleRow[] | { error: string } {
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

/**
 * Texto para `{{DOCUMENTOS}}`: links diretos aos boletos detectados (+ frase quando necessário).
 */
export function buildMinimalDocumentosVar(linkLines: string[]): string {
  if (linkLines.length === 0) return "";
  const hasBoleto = linkLines.some((l) => /boleto/i.test(l));
  const header = hasBoleto
    ? "Links dos boletos (quando houver fatura digital e banco, aparecem as duas linhas):"
    : "Links adicionais:";
  return [
    header,
    "",
    ...linkLines,
    "",
    "Os PDFs podem já estar em anexo; use os URLs no browser quando precisar.",
  ].join("\n");
}

export type PrepareOpenChargesArgs = {
  token: string;
  clientId: string;
  fantasy: string;
  cnpjRaw: string;
  emailRaw: string;
  sales: SaleRow[];
  /** Só no fluxo com pré-visualização; omitir no POST legado. */
  subjectOverride?: string | undefined;
  bodyOverride?: string | undefined;
};

export async function prepareOpenChargesEmail(
  args: PrepareOpenChargesArgs,
): Promise<{
  to: string[];
  subject: string;
  bodyPlain: string;
  html: string;
  attachments: EmailAttachment[];
  linkLines: string[];
}> {
  const to = parseEmailAddresses(args.emailRaw);
  if (!to.length) {
    throw new Error("missing_recipient_emails");
  }
  if (!args.clientId.trim() || !args.cnpjRaw.trim()) {
    throw new Error("missing_client_identity");
  }

  const tpl = await getOrCreateCobrancaAbertaEmailTemplate();
  const totalNum = args.sales.reduce((s, x) => s + x.value, 0);
  const tabela = args.sales.map((x) => parcelaLinhaCsvParaEmail(x)).join("\n");

  const bundle = await collectOpenChargesEmailAssets(args.token, args.clientId, args.sales);
  const docVar = buildMinimalDocumentosVar(bundle.linkLines);

  const vars: Record<string, string> = {
    CLIENTE: args.fantasy,
    MARCA: COMPANY_NAME,
    CNPJ: args.cnpjRaw,
    TABELA_PARCELAS: tabela,
    TOTAL: formatBRL(totalNum),
    DOCUMENTOS: docVar,
  };

  const subjectTemplated = applyCobrancaAbertaPlaceholders(tpl.subject, vars).trim().slice(0, 480);
  const bodyTemplated = applyCobrancaAbertaPlaceholders(tpl.bodyText, vars);

  const subject =
    args.subjectOverride !== undefined
      ? (args.subjectOverride.trim() || subjectTemplated).trim().slice(0, 480)
      : subjectTemplated;

  const bodyPlainRaw =
    args.bodyOverride !== undefined ? args.bodyOverride : bodyTemplated;
  const bodyPlain = bodyPlainRaw.replace(/\n{3,}/g, "\n\n").trimEnd();

  const html = buildCobrancaAbertaEmailHtml({ bodyPlain });

  return {
    to,
    subject: subject || `${COMPANY_NAME} — cobranças em aberto`,
    bodyPlain,
    html,
    attachments: bundle.attachments,
    linkLines: bundle.linkLines,
  };
}
