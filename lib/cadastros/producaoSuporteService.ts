import { prisma } from "@/lib/prisma";
import { resolvePdvProgramacaoAssignment } from "@/lib/criacao/pdvProgramacaoService";
import { buildGoogleMapsFromPdvAddress } from "@/lib/cadastros/googleMapsFromCadastro";
import {
  getProducaoDashboard,
  type DashboardPdvTelemetry,
} from "@/lib/cadastros/producaoDashboardService";
import { loadPortalPlayerIdMaps } from "@/lib/player/loadPortalPlayerIdMaps";
import { clientePlayerPasswordForCliente } from "@/lib/player/clientePlayerLoginService";
import type {
  ProducaoSuportePayload,
  SuportePdvRow,
} from "@/lib/cadastros/producaoSuporteTypes";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function isSemPing5Dias(
  telemetry: DashboardPdvTelemetry,
  statusPlayer: "Ativo" | "Inativo",
  telemetriaOk: boolean,
): boolean {
  if (!telemetriaOk || statusPlayer !== "Ativo") return false;
  const last = telemetry.lastPingAt;
  if (!last) return true;
  const age = Date.now() - new Date(last).getTime();
  return age > FIVE_DAYS_MS;
}

export async function getProducaoSuporte(options?: {
  canRegenerarToken?: boolean;
}): Promise<ProducaoSuportePayload> {
  const dash = await getProducaoDashboard();
  const pdvKeys = dash.clientes.flatMap((c) => c.pdvs.map((p) => p.rioPdvKey));

  if (pdvKeys.length === 0) {
    return {
      layoutYearMonth: dash.layoutYearMonth,
      rioSourceYearMonth: dash.rioSourceYearMonth,
      overview: {
        totalPdvs: 0,
        semPing5Dias: 0,
        chamadosAbertos: null,
        telemetriaDisponivel: false,
        pingsHoje: null,
        cacheMedioPercent: null,
      },
      pdvs: [],
      canRegenerarToken: false,
    };
  }

  const clienteKeys = [...new Set(dash.clientes.map((c) => c.key))];
  const portalMaps = await loadPortalPlayerIdMaps(pdvKeys);
  const linkByKey = portalMaps.byRioPdvKey;
  const portalClienteIds = [
    ...new Set(
      dash.clientes.flatMap((c) =>
        c.pdvs
          .map((p) => linkByKey.get(p.rioPdvKey)?.portalClienteId)
          .filter((id): id is number => id != null),
      ),
    ),
  ];

  const [cadastros, rioPdvs, playerLogins, programacoesPorCliente] = await Promise.all([
    prisma.producaoPdvCadastro.findMany({
      where: { rioPdvKey: { in: pdvKeys } },
      select: {
        rioPdvKey: true,
        endereco: true,
        bairro: true,
        contatoLojaNome: true,
        contatoLojaTelefone: true,
        contatoLojaEmail: true,
        createdAt: true,
        playerInstalacaoToken: true,
        programacaoId: true,
        programacaoMusical: true,
        programacao: { select: { id: true, nome: true, clienteRef: true } },
      },
    }),
    prisma.rioCompPdv.findMany({
      where: { id: { in: pdvKeys.filter((k) => !k.startsWith("linha:")) } },
      select: { id: true, createdAt: true },
    }),
    portalClienteIds.length > 0 ?
      prisma.clientePlayerLogin.findMany({
        where: { portalClienteId: { in: portalClienteIds } },
        select: {
          portalClienteId: true,
          email: true,
          passwordPlain: true,
          active: true,
        },
      })
    : Promise.resolve([]),
    prisma.programacao.findMany({
      where: { clienteRef: { in: clienteKeys } },
      select: { id: true, nome: true, clienteRef: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const programacoesByClienteRef = new Map<string, Array<{ id: string; nome: string }>>();
  for (const prog of programacoesPorCliente) {
    const list = programacoesByClienteRef.get(prog.clienteRef) ?? [];
    list.push({ id: prog.id, nome: prog.nome });
    programacoesByClienteRef.set(prog.clienteRef, list);
  }

  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));
  const rioCreatedByKey = new Map(rioPdvs.map((p) => [p.id, p.createdAt]));
  const loginByPortalId = new Map(playerLogins.map((l) => [l.portalClienteId, l]));

  function resolveClienteLogin(
    portalClienteId: number | null,
    clienteNome: string,
  ): Pick<SuportePdvRow, "clienteLoginEmail" | "clienteLoginPassword" | "clienteLoginPending"> {
    if (portalClienteId == null) {
      return { clienteLoginEmail: null, clienteLoginPassword: null, clienteLoginPending: false };
    }
    const login = loginByPortalId.get(portalClienteId);
    if (login?.active && login.email.trim()) {
      return {
        clienteLoginEmail: login.email.trim(),
        clienteLoginPassword:
          login.passwordPlain.trim() ||
          clientePlayerPasswordForCliente(clienteNome, portalClienteId),
        clienteLoginPending: false,
      };
    }
    return {
      clienteLoginEmail: null,
      clienteLoginPassword: null,
      clienteLoginPending: true,
    };
  }

  const rows: SuportePdvRow[] = [];

  for (const cliente of dash.clientes) {
    for (const pdv of cliente.pdvs) {
      const cad = cadastroByKey.get(pdv.rioPdvKey);
      const link = linkByKey.get(pdv.rioPdvKey);
      const rioCreated = rioCreatedByKey.get(pdv.rioPdvKey);
      const instaladoAt = (cad?.createdAt ?? rioCreated ?? new Date(0)).toISOString();
      const maps = buildGoogleMapsFromPdvAddress({
        nome: pdv.nome,
        endereco: cad?.endereco ?? "",
        bairro: cad?.bairro ?? "",
      });
      const semPing5Dias = isSemPing5Dias(
        pdv.telemetry,
        pdv.statusPlayer,
        dash.overview.telemetriaDisponivel,
      );
      const { programacaoNome: programacaoCriacaoNome } = resolvePdvProgramacaoAssignment(
        cad,
        cliente.key,
        programacoesByClienteRef.get(cliente.key) ?? [],
      );
      const portalClienteId = link?.portalClienteId ?? null;
      const clienteLogin = resolveClienteLogin(portalClienteId, cliente.nome);

      rows.push({
        rioPdvKey: pdv.rioPdvKey,
        nome: pdv.nome,
        tagCobranca: pdv.tagCobranca,
        cnpj: pdv.cnpj,
        clienteNome: cliente.nome,
        clienteTagCobranca: cliente.tagCobranca,
        clienteKey: cliente.key,
        portalPdvId: link?.portalPdvId ?? null,
        portalClienteId,
        ...clienteLogin,
        playerInstalacaoToken: cad?.playerInstalacaoToken?.trim() || null,
        programacaoMusical: pdv.programacaoMusical,
        programacaoCriacaoNome,
        playerVersion: pdv.telemetry.playerVersion,
        contatoLojaNome: cad?.contatoLojaNome?.trim() ?? "",
        contatoLojaTelefone: cad?.contatoLojaTelefone?.trim() ?? "",
        contatoLojaEmail: cad?.contatoLojaEmail?.trim() ?? "",
        googleMapsQuery: maps.query,
        googleMapsUrl: maps.url,
        instaladoAt,
        semPing5Dias,
        telemetry: pdv.telemetry,
        statusPlayer: pdv.statusPlayer,
        controlarPlayer: pdv.controlarPlayer,
      });
    }
  }

  rows.sort((a, b) => b.instaladoAt.localeCompare(a.instaladoAt));

  const semPing5Dias = rows.filter((r) => r.semPing5Dias).length;

  return {
    layoutYearMonth: dash.layoutYearMonth,
    rioSourceYearMonth: dash.rioSourceYearMonth,
    overview: {
      totalPdvs: rows.length,
      semPing5Dias,
      chamadosAbertos: null,
      telemetriaDisponivel: dash.overview.telemetriaDisponivel,
      pingsHoje: dash.overview.pingsHoje,
      cacheMedioPercent: dash.overview.cacheMedioPercent,
    },
    pdvs: rows,
    canRegenerarToken: options?.canRegenerarToken ?? false,
  };
}
