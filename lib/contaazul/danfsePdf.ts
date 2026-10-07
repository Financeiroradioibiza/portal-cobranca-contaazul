import type { CaInstallmentDetail } from "./types";

export function isDanfsePdfBuffer(buf: Buffer): boolean {
  if (buf.length < 500 || buf.subarray(0, 5).toString() !== "%PDF-") return false;
  const sample = buf.subarray(0, Math.min(buf.length, 250_000)).toString("latin1");
  return /Documento Auxiliar da NFS|DANFSe|DANFSE/i.test(sample);
}

/** Mesmo padrão do ERP ao baixar DANFSE (ex.: `RPS-8195.pdf`). */
export function danfsePdfFilename(detail: CaInstallmentDetail): string {
  if (detail.numero_rps != null && detail.numero_rps > 0) {
    return `RPS-${detail.numero_rps}.pdf`;
  }
  if (detail.numero_nfse != null && detail.numero_nfse > 0) {
    return `NFS-e-${detail.numero_nfse}.pdf`;
  }
  return "nota.pdf";
}
