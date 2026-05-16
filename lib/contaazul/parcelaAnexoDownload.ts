import { CONTA_AZUL_API_BASE } from "./config";

/**
 * Tenta obter o binário (ou redirect seguido) de um anexo de parcela quando tipo_conteudo=FILE.
 * Caminhos são tentativas compatíveis com a API financeira v1.
 */
export async function fetchParcelaAnexoFile(
  accessToken: string,
  parcelaId: string,
  anexoId: string,
): Promise<Response | null> {
  const paths = [
    `/v1/financeiro/eventos-financeiros/parcelas/${encodeURIComponent(parcelaId)}/anexos/${encodeURIComponent(anexoId)}/arquivo`,
    `/v1/financeiro/eventos-financeiros/parcelas/${encodeURIComponent(parcelaId)}/anexos/${encodeURIComponent(anexoId)}`,
  ];

  for (const p of paths) {
    const res = await fetch(`${CONTA_AZUL_API_BASE}${p}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "*/*",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) continue;

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      let signed: string | null = null;
      try {
        const j = (await res.json()) as Record<string, unknown>;
        signed =
          (typeof j.url === "string" && j.url) ||
          (typeof j.link === "string" && j.link) ||
          (typeof j.href === "string" && j.href) ||
          null;
      } catch {
        signed = null;
      }
      if (!signed) continue;
      const getSigned = await fetch(signed, { redirect: "follow", cache: "no-store" });
      return getSigned.ok ? getSigned : null;
    }

    return res;
  }

  return null;
}
