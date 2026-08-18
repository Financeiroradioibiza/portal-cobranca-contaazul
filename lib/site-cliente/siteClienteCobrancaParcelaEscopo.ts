import { fetchInstallmentById } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { assertSiteClienteCobrancaAccess } from "@/lib/site-cliente/siteClienteCobrancaDashboardService";
import {
  loadSiteClienteCobrancaEscopo,
  type SiteClienteCobrancaEscopo,
} from "@/lib/site-cliente/siteClienteCobrancaEscopo";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

function forbidden(): never {
  throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
}

export type SiteClienteCobrancaParcelaEscopo = {
  caPersonId: string;
  escopo: SiteClienteCobrancaEscopo;
};

/**
 * Valida que a parcela pertence ao escopo do grupo cobrança.
 * `caPersonId` vem do dashboard (agrupamento por cliente CA); reforça com detalhe da parcela quando disponível.
 */
export async function validateSiteClienteCobrancaParcela(
  session: SiteClienteSessionPayload,
  parcelaId: string,
  caPersonIdHint?: string | null,
): Promise<SiteClienteCobrancaParcelaEscopo> {
  assertSiteClienteCobrancaAccess(session);

  const id = parcelaId.trim();
  if (!id) {
    throw new Response(JSON.stringify({ error: "parcela_invalida" }), { status: 400 });
  }

  const escopo = await loadSiteClienteCobrancaEscopo(session.grupoId);
  if (escopo.caPersonIds.size === 0) forbidden();

  const hint = caPersonIdHint?.trim();
  if (!hint || !escopo.caPersonIds.has(hint)) forbidden();

  const token = await getValidAccessToken();
  if (token) {
    try {
      const detail = await fetchInstallmentById(token, id);
      const ownerId = detail.cliente?.id?.trim();
      if (ownerId) {
        if (!escopo.caPersonIds.has(ownerId)) forbidden();
        return { caPersonId: ownerId, escopo };
      }
    } catch {
      /* CA indisponível ou id alternativo — confia no hint já validado no escopo */
    }
  }

  return { caPersonId: hint, escopo };
}
