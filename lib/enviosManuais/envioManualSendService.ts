import { collectOpenChargesEmailAssets } from "@/lib/cobrancaAberta/collectOpenChargesEmailAssets";
import { buildCobrancaAbertaEmailHtml } from "@/lib/cobrancaAberta/cobrancaAbertaHtml";
import { buildMinimalDocumentosVar } from "@/lib/cobrancaAberta/documentosPlaintext";
import { prepareOpenChargesEmail } from "@/lib/cobrancaAberta/prepareOpenChargesEmail";
import { serviceInvoiceDanfsePublicUrl } from "@/lib/contaazul/serviceInvoicePdf";
import { ensureEnvioManualDanfseFromParcelas } from "@/lib/enviosManuais/ensureEnvioManualDanfseAttachment";
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

function safeNamePrefix(label: string): string {
  return label.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 24) || "cli";
}

function appendDanfseLinkFallback(args: {
  vendaId: string;
  openUrl?: string;
  clientLabel: string;
  bodyPlain: string;
  linkLines: string[];
}): { bodyPlain: string; html: string; linkLines: string[] } {
  const openUrl =
    args.openUrl?.trim() ||
    (args.vendaId.trim() ? serviceInvoiceDanfsePublicUrl(args.vendaId) : "");
  if (!openUrl) {
    return {
      bodyPlain: args.bodyPlain,
      linkLines: args.linkLines,
      html: buildCobrancaAbertaEmailHtml({
        bodyPlain: args.bodyPlain,
        documentosHtmlLinkLines: args.linkLines,
      }),
    };
  }
  const line = `- ${args.clientLabel}: DANFSE (PDF): ${openUrl}`;
  if (args.linkLines.some((l) => l.includes(openUrl))) {
    return {
      bodyPlain: args.bodyPlain,
      linkLines: args.linkLines,
      html: buildCobrancaAbertaEmailHtml({
        bodyPlain: args.bodyPlain,
        documentosHtmlLinkLines: args.linkLines,
      }),
    };
  }
  const linkLines = [...args.linkLines, line];
  const docBlock = buildMinimalDocumentosVar(linkLines);
  const bodyPlain = docBlock ? `${args.bodyPlain.trimEnd()}\n\n${docBlock}` : args.bodyPlain;
  return {
    bodyPlain,
    linkLines,
    html: buildCobrancaAbertaEmailHtml({ bodyPlain, documentosHtmlLinkLines: linkLines }),
  };
}

export type EnvioManualSendResult = {
  sandbox: boolean;
  recipients: string[];
  originalRecipients: string[];
  pdfAttachments: number;
  vendaNumero?: number;
  hadAttachmentGaps: boolean;
  danfseAttached: boolean;
  attachmentFilenames: string[];
  danfseSkipReason?: string;
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

  const { sales, vendaNumero } = await resolveEnvioManualSalesForCliente(
    args.token,
    args.caClienteId,
    60,
  );
  if (!sales.length) throw new Error("no_parcelas_for_client");

  const parcelaIds = sales.map((s) => s.id);
  const danfseAttachments: EmailAttachment[] = [];
  const danfseResult = await ensureEnvioManualDanfseFromParcelas({
    token: args.token,
    parcelaIds,
    attachments: danfseAttachments,
    filenamePrefix: safeNamePrefix(args.clientLabel),
  });

  const prepared = await prepareOpenChargesEmail({
    token: args.token,
    clientId: args.caClienteId,
    fantasy: args.clientLabel,
    cnpjRaw,
    emailRaw: to.join(", "),
    sales,
    subjectOverride: `Boleto + Nota Fiscal · ${args.clientLabel} · ${mesRef}`.slice(0, 480),
    bodyOverride: bodyPlain || undefined,
    boletoNfEmailShell: true,
  });

  const fromPrepare =
    danfseAttachments.length > 0
      ? prepared.attachments.filter((a) => !/RPS-|NFS-e-|nota-/i.test(a.filename))
      : prepared.attachments;
  let attachments = [...danfseAttachments, ...fromPrepare];
  let linkLines = prepared.linkLines;
  let bodyOut = prepared.bodyPlain;
  let htmlOut = prepared.html;

  if (!danfseResult.ok && (danfseResult.idVenda || danfseResult.openUrl)) {
    const withLink = appendDanfseLinkFallback({
      vendaId: danfseResult.idVenda ?? "",
      openUrl: danfseResult.openUrl,
      clientLabel: args.clientLabel,
      bodyPlain: bodyOut,
      linkLines,
    });
    bodyOut = withLink.bodyPlain;
    htmlOut = withLink.html;
    linkLines = withLink.linkLines;
  }

  await sendEmailViaSmtp({
    to: prepared.to,
    subject: prepared.subject,
    text: bodyOut,
    html: htmlOut,
    attachments,
  });

  return {
    sandbox,
    recipients: prepared.to,
    originalRecipients: original,
    pdfAttachments: attachments.length,
    vendaNumero,
    hadAttachmentGaps: linkLines.length > 0,
    danfseAttached: danfseResult.ok,
    attachmentFilenames: attachments.map((a) => a.filename),
    danfseSkipReason: danfseResult.ok ? undefined : danfseResult.skipReason,
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
    const { sales, vendaNumero } = await resolveEnvioManualSalesForCliente(
      args.token,
      c.id,
      40,
    );
    if (!sales.length) {
      bodyParts.push(`• ${c.nome}: nenhuma parcela encontrada na Conta Azul.`);
      linkLines.push(`- ${c.nome}: sem parcelas recentes`);
      continue;
    }
    const danfseForCliente: EmailAttachment[] = [];
    const danfseResult = await ensureEnvioManualDanfseFromParcelas({
      token: args.token,
      parcelaIds: sales.map((s) => s.id),
      attachments: danfseForCliente,
      filenamePrefix: safeNamePrefix(c.nome),
    });
    for (const att of danfseForCliente) {
      if (allAttachments.length >= 26) break;
      allAttachments.push(att);
    }
    const bundle = await collectOpenChargesEmailAssets(args.token, c.id, sales);
    const bundleAtts =
      danfseForCliente.length > 0
        ? bundle.attachments.filter((a) => !/RPS-|NFS-e-|nota-/i.test(a.filename))
        : bundle.attachments;
    for (const att of bundleAtts) {
      if (allAttachments.length >= 26) break;
      allAttachments.push(prefixAttachmentName(c.nome, att));
    }
    if (!danfseResult.ok && danfseResult.openUrl) {
      linkLines.push(`- ${c.nome}: DANFSE (PDF): ${danfseResult.openUrl}`);
    } else if (!danfseResult.ok && danfseResult.idVenda) {
      linkLines.push(`- ${c.nome}: DANFSE (PDF): ${serviceInvoiceDanfsePublicUrl(danfseResult.idVenda)}`);
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

  const danfseCount = allAttachments.filter((a) => /RPS-|NFS-e-/i.test(a.filename)).length;
  return {
    sandbox,
    recipients: to,
    originalRecipients: original,
    pdfAttachments: allAttachments.length,
    hadAttachmentGaps: linkLines.length > 0,
    danfseAttached: danfseCount > 0,
    attachmentFilenames: allAttachments.map((a) => a.filename),
    danfseSkipReason: danfseCount > 0 ? undefined : "pdf_fetch_failed",
    clientesOk,
    clientesTotal: args.grupoClientes.length,
  };
}
