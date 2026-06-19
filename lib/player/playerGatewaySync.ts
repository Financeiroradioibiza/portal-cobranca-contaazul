import { prisma } from "@/lib/prisma";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";
import { compareRioLinhasByNomeFantasia } from "@/lib/rio/sortRioCompLinhas";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { cloud2Fetch } from "@/lib/criacao/cloud2Client";
import { linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { formatPortalPdvIdDisplay, proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import { mapPdvCadastroToGatewayFields } from "@/lib/player/pdvGatewayFields";

export type PlayerGatewaySyncPayload = {
  clientes: Array<{
    id: number;
    nome: string;
    email: string | null;
    senhaHash: string | null;
    origemRioLinhaId: string;
  }>;
  pdvs: Array<{
    id: number;
    clienteId: number;
    nome: string;
    codigoDisplay: string;
    origemRioPdvId: string | null;
    origemRioLinhaId: string;
    instalacaoToken: string | null;
    status: "A" | "I";
    ctrlPlayer: "S" | "N";
    ctrlPlacaCarro: "S" | "N";
    ctrlPlaylists: "S" | "N";
    cidade: string;
    uf: string;
  }>;
};

export async function buildPlayerGatewaySyncPayload(yearMonth?: number): Promise<PlayerGatewaySyncPayload> {
  const months = await prisma.rioCompMonth.findMany({
    orderBy: { yearMonth: "desc" },
    select: { yearMonth: true },
  });
  const ym = yearMonth ?? pickVigenteRioYearMonth(months, currentBrazilYearMonth());

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) throw new Error("rio_month_not_found");

  const [linhas, logins] = await Promise.all([
    prisma.rioCompClienteLinha.findMany({
      where: { monthId: month.id, movimento: { not: "saida" }, portalClienteId: { not: null } },
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        portalClienteId: true,
        pdvs: {
          where: { movimento: { not: "saida" } },
          select: { id: true, nome: true, portalPdvId: true },
        },
      },
    }),
    prisma.clientePlayerLogin.findMany({
      where: { active: true },
      select: { portalClienteId: true, email: true, passwordHash: true },
    }),
  ]);

  linhas.sort(compareRioLinhasByNomeFantasia);
  const loginByClienteId = new Map(logins.map((l) => [l.portalClienteId, l]));

  const rioKeys: string[] = [];
  for (const ln of linhas) {
    if (ln.pdvs.length === 0) rioKeys.push(linhaAsPdvKey(ln.id));
    else for (const p of ln.pdvs) rioKeys.push(p.id);
  }
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: rioKeys } },
    select: {
      rioPdvKey: true,
      playerInstalacaoToken: true,
      controlarPlayer: true,
      placaCarro: true,
      controlarPlaylist: true,
      statusPlayer: true,
      cidade: true,
      estado: true,
    },
  });
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const clientes: PlayerGatewaySyncPayload["clientes"] = [];
  const pdvs: PlayerGatewaySyncPayload["pdvs"] = [];

  for (const ln of linhas) {
    const portalClienteId = ln.portalClienteId!;
    const nome = (ln.nomeFantasia || ln.razaoSocial || "Cliente").trim();
    const login = loginByClienteId.get(portalClienteId);
    clientes.push({
      id: portalClienteId,
      nome,
      email: login?.email ?? null,
      senhaHash: login?.passwordHash ?? null,
      origemRioLinhaId: ln.id,
    });

    const pdvList = sortRioPdvsByNome(ln.pdvs);
    if (pdvList.length === 0) {
      const virtualId = proxyPortalPdvId(portalClienteId);
      const rioKey = linhaAsPdvKey(ln.id);
      const cad = cadastroByKey.get(rioKey);
      const gw = mapPdvCadastroToGatewayFields(cad);
      pdvs.push({
        id: virtualId,
        clienteId: portalClienteId,
        nome,
        codigoDisplay: formatPortalPdvIdDisplay(virtualId),
        origemRioPdvId: null,
        origemRioLinhaId: ln.id,
        instalacaoToken: cad?.playerInstalacaoToken?.trim() || null,
        ...gw,
      });
    } else {
      for (const p of pdvList) {
        if (p.portalPdvId == null) continue;
        const cad = cadastroByKey.get(p.id);
        const gw = mapPdvCadastroToGatewayFields(cad);
        pdvs.push({
          id: p.portalPdvId,
          clienteId: portalClienteId,
          nome: p.nome.trim() || nome,
          codigoDisplay: formatPortalPdvIdDisplay(p.portalPdvId),
          origemRioPdvId: p.id,
          origemRioLinhaId: ln.id,
          instalacaoToken: cad?.playerInstalacaoToken?.trim() || null,
          ...gw,
        });
      }
    }
  }

  return { clientes, pdvs };
}

export async function syncPlayerGatewayRegistry(yearMonth?: number): Promise<{
  clientes: number;
  pdvs: number;
}> {
  const payload = await buildPlayerGatewaySyncPayload(yearMonth);
  const res = await cloud2Fetch("/player/sync-registry", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    clientes?: number;
    pdvs?: number;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "sync_registry_falhou");
  }
  return { clientes: data.clientes ?? payload.clientes.length, pdvs: data.pdvs ?? payload.pdvs.length };
}
