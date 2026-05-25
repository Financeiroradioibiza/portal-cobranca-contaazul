import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { resolveParcelaTipoResource } from "@/lib/contaazul/resolveParcelaTipoResource";
import { fetchInstallmentById } from "@/lib/contaazul/receivables";
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
        continue;
      }
      if (res.kind === "external_redirect") {
        const pdf = await fetchPublicUrlAsPdf(res.url);
        if (pdf && attachments.length < MAX_ATTACHMENTS) {
          attachments.push({
            filename: buildFilename(s.comp, s.id, role),
            content: pdf,
            contentType: "application/pdf",
          });
        } else {
          linkLines.push(`- ${labelShort}: ${res.url}`);
        }
        continue;
      }
    }
  }

  return { attachments, linkLines };
}
