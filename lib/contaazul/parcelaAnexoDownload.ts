import { CONTA_AZUL_API_BASE } from "./config";

function tryPaths(
  accessToken: string,
  paths: string[],
): Promise<Response | null> {
  return (async () => {
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
        if (getSigned.ok) return getSigned;
        continue;
      }

      return res;
    }
    return null;
  })();
}

/**
 * Tenta obter o binário (ou redirect seguido) de um anexo quando tipo_conteudo=FILE.
 * Conta Azul usa paths diferentes para anexo da parcela vs anexo de uma baixa.
 */
export async function fetchParcelaAnexoFile(
  accessToken: string,
  parcelaId: string,
  anexoId: string,
  baixaId?: string | null,
): Promise<Response | null> {
  const encP = encodeURIComponent(parcelaId);
  const encA = encodeURIComponent(anexoId);

  const paths: string[] = [];

  if (baixaId?.trim()) {
    const encB = encodeURIComponent(baixaId.trim());
    paths.push(
      `/v1/financeiro/eventos-financeiros/parcelas/baixa/${encB}/anexos/${encA}/arquivo`,
      `/v1/financeiro/eventos-financeiros/parcelas/baixa/${encB}/anexos/${encA}`,
    );
  }

  paths.push(
    `/v1/financeiro/eventos-financeiros/parcelas/${encP}/anexos/${encA}/arquivo`,
    `/v1/financeiro/eventos-financeiros/parcelas/${encP}/anexos/${encA}`,
  );

  return tryPaths(accessToken, paths);
}
