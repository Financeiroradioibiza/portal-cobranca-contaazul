import { prisma } from "@/lib/prisma";
import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { portalClienteIdFromPdvId } from "@/lib/player/portalPlayerIds";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";

export type SiteClienteGrupoScope = {
  clienteKeys: Set<string>;
  pdvKeys: Set<string>;
};

export async function loadSiteClienteGrupoScope(grupoId: string): Promise<SiteClienteGrupoScope> {
  const g = await prisma.siteClienteGrupo.findUnique({
    where: { id: grupoId },
    include: { clientes: true, pdvs: true },
  });
  if (!g) return { clienteKeys: new Set(), pdvKeys: new Set() };

  return {
    clienteKeys: new Set(g.clientes.map((c) => c.rioLinhaId)),
    pdvKeys: new Set(g.pdvs.map((p) => p.rioPdvKey)),
  };
}

function clienteNoEscopo(
  clienteKey: string,
  rioLinhaId: string,
  pdvKeys: string[],
  clienteKeys: Set<string>,
  scopePdvKeys: Set<string>,
): boolean {
  if (clienteKeys.has(clienteKey) || (rioLinhaId && clienteKeys.has(rioLinhaId))) return true;
  return pdvKeys.some((k) => scopePdvKeys.has(k));
}

/** PDV pertence ao escopo do grupo (cliente inteiro ou PDV avulso). */
export async function pdvEstaNoEscopoSiteCliente(
  grupoId: string,
  rioPdvKey: string,
): Promise<boolean> {
  const { clienteKeys, pdvKeys } = await loadSiteClienteGrupoScope(grupoId);
  if (pdvKeys.has(rioPdvKey)) return true;
  if (clienteKeys.size === 0 && pdvKeys.size === 0) return false;

  const dash = await getProducaoDashboard();
  for (const c of dash.clientes) {
    if (!clienteNoEscopo(c.key, c.rioLinhaId, c.pdvs.map((p) => p.rioPdvKey), clienteKeys, pdvKeys)) {
      continue;
    }
    if (c.pdvs.some((p) => p.rioPdvKey === rioPdvKey)) return true;
  }
  return false;
}

export type SiteClientePdvPortalIds = {
  rioPdvKey: string;
  portalPdvId: number;
  portalClienteId: number;
};

export async function resolvePortalIdsForRioPdvKey(
  rioPdvKey: string,
): Promise<SiteClientePdvPortalIds | null> {
  const layout = await getProducaoCatalogLayout();
  const portalPdvId = layout.portalPdvIdsByRioPdvKey[rioPdvKey] ?? null;
  if (!portalPdvId || !Number.isFinite(portalPdvId) || portalPdvId <= 0) return null;
  const portalClienteId = portalClienteIdFromPdvId(portalPdvId);
  if (!Number.isFinite(portalClienteId) || portalClienteId <= 0) return null;
  return { rioPdvKey, portalPdvId, portalClienteId };
}

function forbidden(): never {
  throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
}

/** Valida sessão TI + escopo + resolve IDs do portal para o PDV. */
export async function assertSiteClientePdvInstalacaoAccess(
  session: SiteClienteSessionPayload,
  rioPdvKey: string,
): Promise<SiteClientePdvPortalIds> {
  if (session.grupoTipo !== "producao") forbidden();
  if (!session.permissoes.gerenciarInstalacaoPlayer) forbidden();

  const key = rioPdvKey.trim();
  if (!key) {
    throw new Response(JSON.stringify({ error: "invalid_key" }), { status: 400 });
  }

  const noEscopo = !(await pdvEstaNoEscopoSiteCliente(session.grupoId, key));
  if (noEscopo) forbidden();

  const ids = await resolvePortalIdsForRioPdvKey(key);
  if (!ids) {
    throw new Response(JSON.stringify({ error: "pdv_sem_portal_id" }), { status: 404 });
  }

  return ids;
}
