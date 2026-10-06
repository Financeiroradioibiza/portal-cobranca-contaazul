import { collectOpenChargesEmailAssets } from "@/lib/cobrancaAberta/collectOpenChargesEmailAssets";
import { buildCobrancaAbertaEmailHtml } from "@/lib/cobrancaAberta/cobrancaAbertaHtml";
import { prepareOpenChargesEmail } from "@/lib/cobrancaAberta/prepareOpenChargesEmail";
import { fetchPersonDetail, normalizeCaPersonBrief } from "@/lib/contaazul/personBilling";
import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import type { EnvioManualGrupoCliente } from "@/lib/enviosManuais/types";
import { applyMesPlaceholder, mesReferenciaAnteriorLabel } from "@/lib/enviosManuais/mesReferencia";
import { resolveEnvioManualSalesForCliente } from "@/lib/enviosManuais/resolveEnvioManualSales";
import { resolveEnvioManualRecipients } from "@/lib/enviosManuais/safeRecipients";

function personCnpj(raw: unknown): string {
  const p = normalizeCaPersonBrief(raw);
  return p?.documento?.trim() ?? "";
}

function prefixAttachmentName(prefix: string, att: EmailAttachment): EmailAttachment {
  const safe = prefix.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 24) || "cli";
  return { ...att, filename: `${safe}-${att.filename}` };
}

export type EnvioManualSendResult = {
  sandbox: boolean;
  recipients: string[];
  originalRecipients: string[];
  pdfAttachments: number;
  vendaNumero?: number;
  hadAttachmentGaps: boolean;
};

export async function sendEnvioManualIndividual(args: {
  token: string;
  caClienteId: string;
  clientLabel: string;
  emails: string[];
  mensagemTemplate: string;
}): Promise<EnvioManualSendResult> {
  if (!isOcSmtpConfigured()) throw new Error("smtp_not_configured");

  const { to, sandbox, original } = resolveEnvioManualRecipients(args.emails);
  const mesRef = mesReferenciaAnteriorLabel();
  const bodyPlain = applyMesPlaceholder(args.mensagemTemplate || "", mesRef).trim();

  const personRaw = await fetchPersonDetail(args.token, args.caClienteId);
  const cnpjRaw = personCnpj(personRaw);
  if (!cnpjRaw) throw new Error("missing_client_cnpj");

  const { sales, vendaNumero } = await resolveEnvioManualSalesForCliente(args.token, args.caClienteId, 15);
  if (!sales.length) throw new Error("no_parcelas_for_client");

  const prepared = await prepareOpenChargesEmail({
    token: args.token,
    clientId: args.caClienteId,
    fantasy: args.clientLabel,
    cnpjRaw,
    emailRaw: to.join(", "),
    sales,
    subjectOverride: `Boleto + Nota Fiscal · ${args.clientLabel} · ${mesRef}`.slice(0, 480),
    bodyOverride: bodyPlain || undefined,
  });

  await sendEmailViaSmtp({
    to: prepared.to,
    subject: prepared.subject,
    text: prepared.bodyPlain,
    html: prepared.html,
    attachments: prepared.attachments,
  });

  return {
    sandbox,
    recipients: prepared.to,
    originalRecipients: original,
    pdfAttachments: prepared.attachments.length,
    vendaNumero,
    hadAttachmentGaps: prepared.linkLines.length > 0,
  };
}

export async function sendEnvioManualGrupo(args: {
  token: string;
  nomeGrupo: string;
  grupoClientes: EnvioManualGrupoCliente[];
  emails: string[];
  mensagemTemplate: string;
}): Promise<EnvioManualSendResult & { clientesOk: number; clientesTotal: number }> {
  if (!isOcSmtpConfigured()) throw new Error("smtp_not_configured");
  if (!args.grupoClientes.length) throw new Error("grupo_vazio");

  const { to, sandbox, original } = resolveEnvioManualRecipients(args.emails);
  const mesRef = mesReferenciaAnteriorLabel();
  const intro = applyMesPlaceholder(args.mensagemTemplate || "", mesRef).trim();

  const allAttachments: EmailAttachment[] = [];
  const linkLines: string[] = [];
  const bodyParts: string[] = [intro, "", `Grupo: ${args.nomeGrupo}`, ""];
  let clientesOk = 0;

  for (const c of args.grupoClientes) {
    const { sales, vendaNumero } = await resolveEnvioManualSalesForCliente(args.token, c.id, 40);
    if (!sales.length) {
      bodyParts.push(`• ${c.nome}: nenhuma parcela encontrada na Conta Azul.`);
      linkLines.push(`- ${c.nome}: sem parcelas recentes`);
      continue;
    }
    const bundle = await collectOpenChargesEmailAssets(args.token, c.id, sales);
    for (const att of bundle.attachments) {
      if (allAttachments.length >= 26) break;
      allAttachments.push(prefixAttachmentName(c.nome, att));
    }
    linkLines.push(...bundle.linkLines.map((l) => `- ${c.nome}: ${l.replace(/^-\s*/, "")}`));
    clientesOk += 1;
    bodyParts.push(
      `• ${c.nome}${vendaNumero ? ` (venda ${vendaNumero})` : ""}: ${bundle.attachments.length} PDF(s).`,
    );
  }

  const bodyPlain = bodyParts.join("\n");
  const html = buildCobrancaAbertaEmailHtml({ bodyPlain, documentosHtmlLinkLines: linkLines });
  const subject = `Boleto + Nota Fiscal · ${args.nomeGrupo} · ${mesRef}`.slice(0, 480);

  await sendEmailViaSmtp({
    to,
    subject,
    text: bodyPlain,
    html,
    attachments: allAttachments,
  });

  return {
    sandbox,
    recipients: to,
    originalRecipients: original,
    pdfAttachments: allAttachments.length,
    hadAttachmentGaps: linkLines.length > 0,
    clientesOk,
    clientesTotal: args.grupoClientes.length,
  };
}
