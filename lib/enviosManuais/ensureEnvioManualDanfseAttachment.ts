import { isDanfsePdfBuffer } from "@/lib/contaazul/danfsePdf";
import { fetchServiceInvoicePdfBufferByVendaId } from "@/lib/contaazul/serviceInvoicePdf";
import type { EmailAttachment } from "@/lib/email/ocSmtp";

const MAX_ATTACHMENTS = 26;

function attachmentsIncludeDanfse(atts: EmailAttachment[]): boolean {
  return atts.some((a) => /RPS-|NFS-e-|nota\.pdf|nota-/i.test(a.filename));
}

/** Garante PDF DANFSE no e-mail usando UUID da venda (1 NFS-e por venda, independente da parcela). */
export async function ensureEnvioManualDanfseAttachment(args: {
  token: string;
  vendaId: string;
  attachments: EmailAttachment[];
  filename: string;
  filenamePrefix?: string;
}): Promise<boolean> {
  const vendaId = args.vendaId.trim();
  if (!vendaId) return false;
  if (attachmentsIncludeDanfse(args.attachments)) return true;
  if (args.attachments.length >= MAX_ATTACHMENTS) return false;

  const buf = await fetchServiceInvoicePdfBufferByVendaId(vendaId, args.token);
  if (!buf || !(isDanfsePdfBuffer(buf) || buf.length >= 50_000)) return false;

  const baseName = args.filename.trim() || "nota.pdf";
  const filename = args.filenamePrefix
    ? `${args.filenamePrefix.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 24)}-${baseName}`
    : baseName;

  args.attachments.push({
    filename,
    content: buf,
    contentType: "application/pdf",
  });
  return true;
}
