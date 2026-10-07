import { danfsePdfFilename } from "./danfsePdf";
import { fetchInstallmentById } from "./receivables";
import {
  ensureVendaIdForNfPdf,
  enrichInstallmentVendaContext,
} from "./resolveVendaFromInstallment";
import { serviceInvoiceDanfsePublicUrl } from "./serviceInvoicePdf";

export type ParcelaDanfseMeta = {
  openUrl: string;
  filename: string;
  idVenda: string;
  numeroVenda?: number;
  numeroNfse?: number;
  numeroRps?: number;
};

/** Metadados do DANFSE (URL pública no browser — não depende do Netlify baixar app.contaazul.com). */
export async function resolveParcelaDanfseMeta(
  token: string,
  parcelaId: string,
): Promise<ParcelaDanfseMeta | null> {
  let detail = await fetchInstallmentById(token, parcelaId);
  detail = await enrichInstallmentVendaContext(token, detail);
  detail = await ensureVendaIdForNfPdf(token, detail);
  const idVenda = detail.id_venda?.trim();
  if (!idVenda) return null;

  return {
    idVenda,
    openUrl: serviceInvoiceDanfsePublicUrl(idVenda),
    filename: danfsePdfFilename(detail),
    numeroVenda: detail.numero_venda,
    numeroNfse: detail.numero_nfse,
    numeroRps: detail.numero_rps,
  };
}
