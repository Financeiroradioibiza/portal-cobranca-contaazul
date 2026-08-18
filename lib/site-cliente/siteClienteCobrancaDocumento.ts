import { resolveParcelaTipoResource } from "@/lib/contaazul/resolveParcelaTipoResource";
import { fetchInstallmentById } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { validateSiteClienteCobrancaParcela } from "@/lib/site-cliente/siteClienteCobrancaParcelaEscopo";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

export async function resolveSiteClienteCobrancaDocumento(
  session: SiteClienteSessionPayload,
  parcelaId: string,
  tipo: "boleto" | "nf",
  caPersonIdHint?: string | null,
) {
  if (tipo === "boleto" && !session.permissoes.baixarBoleto) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  if (tipo === "nf" && !session.permissoes.baixarNota) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  await validateSiteClienteCobrancaParcela(session, parcelaId, caPersonIdHint);

  const token = await getValidAccessToken();
  if (!token) {
    throw new Response(JSON.stringify({ error: "conta_azul_indisponivel" }), { status: 503 });
  }

  const id = parcelaId.trim();
  let detail;
  try {
    detail = await fetchInstallmentById(token, id);
  } catch (e) {
    const m = e instanceof Error ? e.message : "Erro ao buscar parcela.";
    throw new Response(JSON.stringify({ error: "upstream_error", message: m }), { status: 502 });
  }

  return resolveParcelaTipoResource(token, id, tipo, detail);
}
