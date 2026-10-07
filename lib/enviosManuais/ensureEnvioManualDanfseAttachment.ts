import { resolveParcelaDanfseMeta } from "@/lib/contaazul/resolveParcelaDanfseMeta";
import type { EmailAttachment } from "@/lib/email/ocSmtp";
import { fetchDanfsePdfViaVencidosPath } from "@/lib/enviosManuais/fetchDanfseViaVencidosPath";

const MAX_ATTACHMENTS = 26;

function attachmentsIncludeDanfse(atts: EmailAttachment[]): boolean {
  return atts.some((a) => /RPS-|NFS-e-|nota\.pdf|nota-/i.test(a.filename));
}

/**
 * Anexa DANFSE no e-mail usando o mesmo fluxo do botão Nota em Vencidos (por parcela).
 * Tenta cada parcela até obter o PDF.
 */
export async function ensureEnvioManualDanfseFromParcelas(args: {
  token: string;
  parcelaIds: string[];
  attachments: EmailAttachment[];
  filenamePrefix?: string;
}): Promise<{
  ok: boolean;
  idVenda?: string;
  openUrl?: string;
  filename?: string;
  /** Diagnóstico (modo teste / logs). */
  skipReason?: "no_parcela" | "no_meta" | "pdf_fetch_failed" | "no_criacao_secret";
}> {
  if (!args.parcelaIds.length) return { ok: false, skipReason: "no_parcela" };
  if (attachmentsIncludeDanfse(args.attachments)) return { ok: true };
  if (args.attachments.length >= MAX_ATTACHMENTS) return { ok: false };

  let lastMeta: { idVenda: string; openUrl: string; filename: string } | undefined;

  for (const parcelaId of args.parcelaIds) {
    const meta = await resolveParcelaDanfseMeta(args.token, parcelaId).catch(() => null);
    if (meta) {
      lastMeta = { idVenda: meta.idVenda, openUrl: meta.openUrl, filename: meta.filename };
    }

    const got = await fetchDanfsePdfViaVencidosPath(args.token, parcelaId);
    if (!got) continue;

    const baseName = got.filename.trim() || "nota.pdf";
    const filename = args.filenamePrefix
      ? `${args.filenamePrefix.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 24)}-${baseName}`
      : baseName;

    args.attachments.push({
      filename,
      content: got.buffer,
      contentType: "application/pdf",
    });
    return { ok: true, idVenda: got.idVenda, openUrl: got.openUrl, filename: baseName };
  }

  if (lastMeta) {
    const secret = (process.env.CRIACAO_INGEST_SECRET ?? "").trim();
    return {
      ok: false,
      idVenda: lastMeta.idVenda,
      openUrl: lastMeta.openUrl,
      filename: lastMeta.filename,
      skipReason: secret ? "pdf_fetch_failed" : "no_criacao_secret",
    };
  }
  return { ok: false, skipReason: "no_meta" };
}
