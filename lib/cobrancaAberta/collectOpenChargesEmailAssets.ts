import type { EmailAttachment } from "@/lib/email/ocSmtp";
import {
  extractBillingChargeFileUuid,
  extractBillingChargeUuidFromUrlString,
  fetchBillingChargePdfPublic,
} from "@/lib/contaazul/billingChargeFilePdf";
import { listBoletoLinksForInstallmentEmail } from "@/lib/contaazul/boletoLinksForEmail";
import { extractBoletoAndDocUrls } from "@/lib/contaazul/installmentLinks";
import { resolveParcelaTipoResource } from "@/lib/contaazul/resolveParcelaTipoResource";
import { fetchInstallmentById } from "@/lib/contaazul/receivables";
import type { CaInstallmentDetail } from "@/lib/contaazul/types";
import type { SaleRow } from "@/lib/types";

const MAX_ATTACHMENTS = 26;

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 28) || "x";
}

function buildFilename(comp: string, id: string, role: string): string {
  const short = id.replace(/[^a-zA-Z0-9._-]/g, "").slice(-10) || id.slice(0, 8);
  return `${role}-${sanitizeFilenamePart(comp)}-${short}.pdf`;
}

function isProbablyPdf(buf: Buffer, mime?: string | null): boolean {
  if (mime?.toLowerCase().includes("pdf")) return true;
  return buf.length >= 5 && buf.subarray(0, 5).toString() === "%PDF-";
}

/** PDF do boleto iugu/faturas (`public.contaazul.com/.../charge/file/{uuid}`). */
async function tryAttachPublicBillingBoletoPdf(
  detail: CaInstallmentDetail,
  sale: SaleRow,
  attachments: EmailAttachment[],
): Promise<boolean> {
  if (attachments.length >= MAX_ATTACHMENTS) return false;

  const parcelaLinks = extractBoletoAndDocUrls(detail);
  const referers: string[] = [];
  if (parcelaLinks.boletoUrl) referers.push(parcelaLinks.boletoUrl);
  for (const row of listBoletoLinksForInstallmentEmail(detail)) {
    if (/digital \(conta azul\)/i.test(row.label)) referers.push(row.href);
  }

  const uuids = new Set<string>();
  const primary = extractBillingChargeFileUuid(detail, parcelaLinks);
  if (primary) uuids.add(primary);
  for (const ref of referers) {
    const u = extractBillingChargeUuidFromUrlString(ref);
    if (u) uuids.add(u);
  }
  if (!uuids.size) return false;

  for (const uuid of uuids) {
    const trialReferers = [
      ...referers,
      `https://faturas.contaazul.com/?tipo=boleto#/fatura/visualizar/${uuid}`,
    ];
    for (const ref of trialReferers) {
      const got = await fetchBillingChargePdfPublic(uuid, { preferredReferer: ref });
      if (!got?.buffer || !isProbablyPdf(got.buffer, "application/pdf")) continue;
      attachments.push({
        filename: buildFilename(sale.comp, sale.id, "boleto"),
        content: got.buffer,
        contentType: "application/pdf",
      });
      return true;
    }
  }
  return false;
}

async function fetchPublicUrlAsPdf(url: string): Promise<Buffer | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 28000);
    const r = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "*/*" },
      signal: ctl.signal,
    }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200) return null;
    if (mime.includes("pdf") || buf.subarray(0, 5).toString() === "%PDF-") return buf;
    return null;
  } catch {
    return null;
  }
}

/** PDFs quando direto/anexo na API ou via PDF público iugu (`public.contaazul.com/.../charge/file`); resto são links ou HTML-only. */
export async function collectOpenChargesEmailAssets(
  token: string,
  clientId: string,
  sales: SaleRow[],
): Promise<{ attachments: EmailAttachment[]; linkLines: string[] }> {
  const attachments: EmailAttachment[] = [];
  const linkLines: string[] = [];

  for (const s of sales) {
    let detail;
    try {
      detail = await fetchInstallmentById(token, s.id);
    } catch {
      linkLines.push(
        `- Competência ${s.comp} · venc. ${s.due}: não foi possível carregar dados da parcela na Conta Azul.`,
      );
      continue;
    }
    if (detail.cliente?.id && detail.cliente.id !== clientId) {
      throw new Error(`A parcela ${s.id.slice(0, 8)}… não pertence a este cliente.`);
    }

    let boletoAttached = false;
    let nfAttached = false;

    for (const role of ["boleto", "nf"] as const) {
      if (attachments.length >= MAX_ATTACHMENTS) break;
      const tipo = role === "nf" ? "nf" : "boleto";
      const labelShort = `${s.comp} · venc. ${s.due} · ${role === "boleto" ? "Boleto" : "Nota"}`;

      const res = await resolveParcelaTipoResource(token, s.id, tipo, detail);
      if (res.kind === "buffer") {
        if (!isProbablyPdf(res.data, res.mime)) {
          linkLines.push(
            `- ${labelShort}: arquivo no Conta Azul (não está em PDF direto aqui — abrir no ERP ou pelos botões do portal).`,
          );
          continue;
        }
        attachments.push({
          filename: buildFilename(s.comp, s.id, role),
          content: res.data,
          contentType: "application/pdf",
        });
        if (role === "boleto") boletoAttached = true;
        else nfAttached = true;
        continue;
      }
      if (res.kind === "external_redirect") {
        if (tipo === "boleto") {
          const uuidRetry = extractBillingChargeUuidFromUrlString(res.url);
          if (uuidRetry) {
            const got = await fetchBillingChargePdfPublic(uuidRetry, {
              preferredReferer: res.url,
            });
            if (
              got?.buffer &&
              isProbablyPdf(got.buffer, "application/pdf") &&
              attachments.length < MAX_ATTACHMENTS
            ) {
              attachments.push({
                filename: buildFilename(s.comp, s.id, role),
                content: got.buffer,
                contentType: "application/pdf",
              });
              boletoAttached = true;
              continue;
            }
          }
        }
        const pdf = await fetchPublicUrlAsPdf(res.url);
        if (pdf && attachments.length < MAX_ATTACHMENTS) {
          attachments.push({
            filename: buildFilename(s.comp, s.id, role),
            content: pdf,
            contentType: "application/pdf",
          });
          if (role === "boleto") boletoAttached = true;
          else nfAttached = true;
        } else if (tipo !== "boleto") {
          linkLines.push(`- ${labelShort}: ${res.url}`);
        }
        if (tipo === "boleto" && !boletoAttached) {
          boletoAttached = await tryAttachPublicBillingBoletoPdf(detail, s, attachments);
        }
        continue;
      }

      if (tipo === "boleto" && !boletoAttached) {
        boletoAttached = await tryAttachPublicBillingBoletoPdf(detail, s, attachments);
        if (boletoAttached) continue;
      }
      if (tipo === "nf" && !nfAttached && res.kind === "not_found") {
        linkLines.push(`- ${labelShort}: nota não encontrada na Conta Azul para esta parcela.`);
      }
    }

    /** Links de boleto só quando não anexamos PDF (digital) ou para banco/registradora. */
    for (const row of listBoletoLinksForInstallmentEmail(detail)) {
      if (boletoAttached && /digital \(conta azul\)/i.test(row.label)) continue;
      linkLines.push(`- ${s.comp} · venc. ${s.due} · ${row.label}: ${row.href}`);
    }
  }

  return { attachments, linkLines };
}
