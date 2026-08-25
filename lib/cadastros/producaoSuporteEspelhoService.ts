import { prisma } from "@/lib/prisma";
import { resolvePdvProgramacaoAssignment } from "@/lib/criacao/pdvProgramacaoService";
import { buildGoogleMapsFromPdvAddress } from "@/lib/cadastros/googleMapsFromCadastro";
import {
  getProducaoDashboard,
  type DashboardPdvTelemetry,
} from "@/lib/cadastros/producaoDashboardService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { loadPortalPlayerIdMaps } from "@/lib/player/loadPortalPlayerIdMaps";
import {
  loadPlayerGatewayTelemetry,
  mergeGatewayTelemetry,
} from "@/lib/player/loadPlayerGatewayTelemetry";
import { resolvePortalPdvIdFromRioPdvKey } from "@/lib/player/playerGatewaySync";
import { clientePlayerPasswordForCliente } from "@/lib/player/clientePlayerLoginService";
import { getProducaoCatalogMeta } from "@/lib/cadastros/producaoCatalogo";
import type {
  ProducaoSuporteEspelhoStored,
  SuporteClienteCancelado,
  SuporteClienteSummary,
  SuporteOverview,
  SuportePdvRow,
} from "@/lib/cadastros/producaoSuporteTypes";
import { isSuporteEspelhoEnabled } from "@/lib/cadastros/producaoSuporteEspelhoConfig";

const ESPELHO_ID = "current";
const TELEMETRY_STALE_MS = 12 * 60 * 1000;

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const CLEARED_TELEMETRY: DashboardPdvTelemetry = {
  playerVersion: null,
  downloadPercent: null,
  firstPingAt: null,
  lastPingAt: null,
  isOnline: null,
};

export type PatchEspelhoPdvOptions = {
  /** Zera ping/cache no espelho (ex.: após regerar token). */
  resetTelemetry?: boolean;
};

function isSemPing5Dias(
  telemetry: DashboardPdvTelemetry,
  statusPlayer: "Ativo" | "Inativo",
  telemetriaOk: boolean,
): boolean {
  if (!telemetriaOk || statusPlayer !== "Ativo") return false;
  const last = telemetry.lastPingAt;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > FIVE_DAYS_MS;
}

function isPlayerInstalado(row: SuportePdvRow): boolean {
  return Boolean(
    row.playerInstalacaoToken &&
      row.telemetry.firstPingAt &&
      row.statusPlayer === "Ativo",
  );
}

function isSemPrimeiroPing(row: SuportePdvRow): boolean {
  return row.portalPdvId != null && !row.telemetry.firstPingAt && row.statusPlayer === "Ativo";
}

export function sortSuporteRowsByFirstPing(rows: SuportePdvRow[]): void {
  rows.sort((a, b) => {
    const fa = a.telemetry.firstPingAt;
    const fb = b.telemetry.firstPingAt;
    if (fa && fb) return fb.localeCompare(fa);
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;
    return b.instaladoAt.localeCompare(a.instaladoAt);
  });
}

function computeOverview(
  rows: SuportePdvRow[],
  telemetriaOk: boolean,
  pingsHoje: number | null,
  cacheMedioPercent: number | null,
  clientesCanceladosCount: number,
): SuporteOverview {
  const cacheSamples = rows
    .map((r) => r.telemetry.downloadPercent)
    .filter((p): p is number => p != null);
  const cacheMedio =
    cacheMedioPercent ??
    (cacheSamples.length > 0
      ? Math.round(cacheSamples.reduce((a, b) => a + b, 0) / cacheSamples.length)
      : null);

  return {
    totalPdvs: rows.length,
    semPing5Dias: rows.filter((r) => r.semPing5Dias).length,
    playersInstalados: rows.filter(isPlayerInstalado).length,
    semPrimeiroPing: rows.filter(isSemPrimeiroPing).length,
    clientesCancelados: clientesCanceladosCount,
    chamadosAbertos: null,
    telemetriaDisponivel: telemetriaOk,
    pingsHoje,
    cacheMedioPercent: cacheMedio,
  };
}

function buildClienteSummaries(
  rows: SuportePdvRow[],
  dashClientes: Array<{ key: string; nome: string; tagCobranca: SuportePdvRow["tagCobranca"]; pdvCount: number }>,
): SuporteClienteSummary[] {
  const byKey = new Map<string, SuporteClienteSummary>();
  for (const c of dashClientes) {
    byKey.set(c.key, {
      key: c.key,
      nome: c.nome,
      tagCobranca: c.tagCobranca,
      portalClienteId: null,
      pdvCount: c.pdvCount,
      semPingCount: 0,
    });
  }
  for (const row of rows) {
    let opt = byKey.get(row.clienteKey);
    if (!opt) {
      opt = {
        key: row.clienteKey,
        nome: row.clienteNome,
        tagCobranca: row.clienteTagCobranca,
        portalClienteId: row.portalClienteId,
        pdvCount: 0,
        semPingCount: 0,
      };
      byKey.set(row.clienteKey, opt);
    }
    if (row.portalClienteId != null && opt.portalClienteId == null) {
      opt.portalClienteId = row.portalClienteId;
    }
    if (row.semPing5Dias) opt.semPingCount += 1;
  }
  return [...byKey.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function loadClientesCancelados(): Promise<SuporteClienteCancelado[]> {
  const meta = await getProducaoCatalogMeta();
  const [month, rawLayout] = await Promise.all([
    prisma.rioCompMonth.findUnique({
      where: { yearMonth: meta.rioSourceYearMonth },
      include: {
        linhas: {
          where: { movimento: "saida" },
          orderBy: [{ sortOrder: "asc" }],
          select: {
            id: true,
            nomeFantasia: true,
            razaoSocial: true,
            tagCobranca: true,
            dataSaidaTexto: true,
            movimento: true,
          },
        },
      },
    }),
    getProducaoCatalogLayout({ repairPlacements: false }),
  ]);

  if (!month) return [];

  const baselineSaida = new Set(rawLayout.movimentoBaselineSaidaIds ?? []);

  const out: SuporteClienteCancelado[] = [];
  for (const ln of month.linhas) {
    const proxyId = `linha:${ln.id}`;
    if (baselineSaida.has(proxyId)) continue;
    const nome = ln.nomeFantasia.trim() || ln.razaoSocial.trim() || "Cliente";
    out.push({
      rioLinhaId: ln.id,
      nome,
      tagCobranca: ln.tagCobranca,
      dataSaidaTexto: ln.dataSaidaTexto.trim() || null,
    });
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return out;
}

/** Monta o espelho completo (Rio + cadastros + telemetria cloud2). */
export async function buildProducaoSuporteEspelhoPayload(): Promise<ProducaoSuporteEspelhoStored> {
  const dash = await getProducaoDashboard();
  const pdvKeys = dash.clientes.flatMap((c) => c.pdvs.map((p) => p.rioPdvKey));

  const clientesCancelados = await loadClientesCancelados();

  if (pdvKeys.length === 0) {
    return {
      layoutYearMonth: dash.layoutYearMonth,
      rioSourceYearMonth: dash.rioSourceYearMonth,
      overview: computeOverview([], false, null, null, clientesCancelados.length),
      pdvs: [],
      clientes: [],
      clientesCancelados,
      espelhoBuiltAt: new Date().toISOString(),
      espelhoTelemetryAt: null,
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
        playerInstaladoEm: true,
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
    portalClienteIds.length > 0
      ? prisma.clientePlayerLogin.findMany({
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
  const telemetriaOk = dash.overview.telemetriaDisponivel;

  for (const cliente of dash.clientes) {
    for (const pdv of cliente.pdvs) {
      const cad = cadastroByKey.get(pdv.rioPdvKey);
      const link = linkByKey.get(pdv.rioPdvKey);
      const rioCreated = rioCreatedByKey.get(pdv.rioPdvKey);
      const instaladoAt = (
        cad?.playerInstaladoEm ?? cad?.createdAt ?? rioCreated ?? new Date(0)
      ).toISOString();
      const maps = buildGoogleMapsFromPdvAddress({
        nome: pdv.nome,
        endereco: cad?.endereco ?? "",
        bairro: cad?.bairro ?? "",
      });
      const semPing5Dias = isSemPing5Dias(pdv.telemetry, pdv.statusPlayer, telemetriaOk);
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

  sortSuporteRowsByFirstPing(rows);

  const clientes = buildClienteSummaries(rows, dash.clientes);

  return {
    layoutYearMonth: dash.layoutYearMonth,
    rioSourceYearMonth: dash.rioSourceYearMonth,
    overview: computeOverview(
      rows,
      telemetriaOk,
      dash.overview.pingsHoje,
      dash.overview.cacheMedioPercent,
      clientesCancelados.length,
    ),
    pdvs: rows,
    clientes,
    clientesCancelados,
    espelhoBuiltAt: new Date().toISOString(),
    espelhoTelemetryAt: telemetriaOk ? new Date().toISOString() : null,
  };
}

async function readEspelhoRow() {
  return prisma.producaoSuporteEspelho.findUnique({ where: { id: ESPELHO_ID } });
}

async function saveEspelhoPayload(payload: ProducaoSuporteEspelhoStored, telemetryAt: Date | null) {
  const now = new Date();
  await prisma.producaoSuporteEspelho.upsert({
    where: { id: ESPELHO_ID },
    create: {
      id: ESPELHO_ID,
      payloadJson: payload as object,
      builtAt: now,
      telemetryAt,
      updatedAt: now,
    },
    update: {
      payloadJson: payload as object,
      builtAt: now,
      telemetryAt,
    },
  });
}

export async function rebuildProducaoSuporteEspelho(): Promise<ProducaoSuporteEspelhoStored> {
  const payload = await buildProducaoSuporteEspelhoPayload();
  await saveEspelhoPayload(
    payload,
    payload.espelhoTelemetryAt ? new Date(payload.espelhoTelemetryAt) : null,
  );
  return payload;
}

function parseStoredPayload(raw: unknown): ProducaoSuporteEspelhoStored | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ProducaoSuporteEspelhoStored;
  if (!Array.isArray(p.pdvs) || !p.overview) return null;
  return p;
}

export async function loadProducaoSuporteEspelho(): Promise<{
  payload: ProducaoSuporteEspelhoStored;
  telemetryAt: Date | null;
}> {
  const row = await readEspelhoRow();
  if (!row) {
    const payload = await rebuildProducaoSuporteEspelho();
    return { payload, telemetryAt: payload.espelhoTelemetryAt ? new Date(payload.espelhoTelemetryAt) : null };
  }
  const payload = parseStoredPayload(row.payloadJson);
  if (!payload) {
    const rebuilt = await rebuildProducaoSuporteEspelho();
    return { payload: rebuilt, telemetryAt: new Date() };
  }
  return { payload, telemetryAt: row.telemetryAt };
}

export function espelhoTelemetryIsStale(telemetryAt: Date | null): boolean {
  if (!telemetryAt) return true;
  return Date.now() - telemetryAt.getTime() > TELEMETRY_STALE_MS;
}

/** Atualiza só ping/cache no espelho (mantém cadastros). */
export async function refreshProducaoSuporteEspelhoTelemetry(): Promise<boolean> {
  const row = await readEspelhoRow();
  if (!row) return false;
  const payload = parseStoredPayload(row.payloadJson);
  if (!payload || payload.pdvs.length === 0) return false;

  const portalPdvIds = payload.pdvs
    .map((p) => p.portalPdvId)
    .filter((id): id is number => id != null && id > 0);
  const gateway = await loadPlayerGatewayTelemetry(portalPdvIds);
  const telemetriaOk = gateway.ok;

  for (const pdvRow of payload.pdvs) {
    const portalPdvId = pdvRow.portalPdvId;
    const gw = portalPdvId != null ? gateway.byPdvId.get(portalPdvId) : undefined;
    const lastPingAt = gw?.lastPingAt ?? null;
    const isOnline =
      lastPingAt != null ? Date.now() - new Date(lastPingAt).getTime() <= 90 * 60 * 1000 : null;
    pdvRow.telemetry = {
      firstPingAt: gw?.firstPingAt ?? null,
      lastPingAt,
      playerVersion: gw?.playerVersion ?? pdvRow.playerVersion,
      downloadPercent: gw?.downloadPercent ?? null,
      isOnline,
    };
    pdvRow.semPing5Dias = isSemPing5Dias(pdvRow.telemetry, pdvRow.statusPlayer, telemetriaOk);
  }

  sortSuporteRowsByFirstPing(payload.pdvs);
  payload.overview = computeOverview(
    payload.pdvs,
    telemetriaOk,
    gateway.pingsToday,
    null,
    payload.clientesCancelados?.length ?? 0,
  );
  const now = new Date();
  payload.espelhoTelemetryAt = now.toISOString();

  await saveEspelhoPayload(payload, now);
  return true;
}

export type RefreshPdvTelemetryResult = {
  ok: true;
  telemetriaDisponivel: boolean;
  telemetry: DashboardPdvTelemetry;
  semPing5Dias: boolean;
  playerVersion: string | null;
};

/** Atualiza ping/cache de um único PDV (cloud2) e persiste no espelho quando existir. */
export async function refreshProducaoSuporteEspelhoPdvTelemetry(
  rioPdvKey: string,
): Promise<RefreshPdvTelemetryResult> {
  const portalPdvId = await resolvePortalPdvIdFromRioPdvKey(rioPdvKey);
  if (!portalPdvId) {
    throw new Error("pdv_sem_portal_id");
  }

  let statusPlayer: "Ativo" | "Inativo" = "Ativo";
  let fallbackVersion: string | null = null;

  const espelhoRow = await readEspelhoRow();
  const espelhoPayload =
    espelhoRow ? parseStoredPayload(espelhoRow.payloadJson) : null;
  const espelhoPdv = espelhoPayload?.pdvs.find((p) => p.rioPdvKey === rioPdvKey);
  if (espelhoPdv) {
    statusPlayer = espelhoPdv.statusPlayer;
    fallbackVersion = espelhoPdv.playerVersion;
  }

  const gateway = await loadPlayerGatewayTelemetry([portalPdvId]);
  const telemetriaOk = gateway.ok;
  const telemetry = mergeGatewayTelemetry(portalPdvId, gateway.byPdvId, fallbackVersion);
  const semPing5Dias = isSemPing5Dias(telemetry, statusPlayer, telemetriaOk);

  if (isSuporteEspelhoEnabled() && espelhoRow && espelhoPayload && espelhoPdv) {
    espelhoPdv.telemetry = telemetry;
    espelhoPdv.semPing5Dias = semPing5Dias;
    if (telemetry.playerVersion) espelhoPdv.playerVersion = telemetry.playerVersion;
    espelhoPayload.overview = computeOverview(
      espelhoPayload.pdvs,
      telemetriaOk,
      espelhoPayload.overview.pingsHoje,
      null,
      espelhoPayload.clientesCancelados?.length ?? 0,
    );
    await saveEspelhoPayload(espelhoPayload, espelhoRow.telemetryAt);
  }

  return {
    ok: true,
    telemetriaDisponivel: telemetriaOk,
    telemetry,
    semPing5Dias,
    playerVersion: telemetry.playerVersion,
  };
}

/** Reprocessa um PDV no espelho (cadastro, token, telemetria). */
export async function patchProducaoSuporteEspelhoPdv(
  rioPdvKey: string,
  options?: PatchEspelhoPdvOptions,
): Promise<void> {
  const row = await readEspelhoRow();
  if (!row) {
    await rebuildProducaoSuporteEspelho();
    return;
  }

  const fresh = await buildProducaoSuporteEspelhoPayload();
  const updated = fresh.pdvs.find((p) => p.rioPdvKey === rioPdvKey);
  const payload = parseStoredPayload(row.payloadJson);
  if (!payload || !updated) {
    await rebuildProducaoSuporteEspelho();
    return;
  }

  if (options?.resetTelemetry) {
    updated.telemetry = { ...CLEARED_TELEMETRY };
    updated.playerVersion = null;
    updated.semPing5Dias = isSemPing5Dias(
      updated.telemetry,
      updated.statusPlayer,
      payload.overview.telemetriaDisponivel,
    );
  }

  const idx = payload.pdvs.findIndex((p) => p.rioPdvKey === rioPdvKey);
  if (idx >= 0) payload.pdvs[idx] = updated;
  else payload.pdvs.push(updated);

  sortSuporteRowsByFirstPing(payload.pdvs);
  payload.overview = computeOverview(
    payload.pdvs,
    payload.overview.telemetriaDisponivel,
    payload.overview.pingsHoje,
    options?.resetTelemetry ? null : payload.overview.cacheMedioPercent,
    payload.clientesCancelados?.length ?? fresh.clientesCancelados.length,
  );
  payload.clientes = buildClienteSummaries(
    payload.pdvs,
    fresh.clientes.map((c) => ({
      key: c.key,
      nome: c.nome,
      tagCobranca: c.tagCobranca,
      pdvCount: c.pdvCount,
    })),
  );
  payload.espelhoBuiltAt = new Date().toISOString();
  if (options?.resetTelemetry) {
    payload.espelhoTelemetryAt = new Date().toISOString();
  }

  const telemetryAt = options?.resetTelemetry ? new Date() : row.telemetryAt;
  await saveEspelhoPayload(payload, telemetryAt);
}

export function scheduleProducaoSuporteEspelhoPatch(
  rioPdvKey: string,
  options?: PatchEspelhoPdvOptions,
): void {
  if (!isSuporteEspelhoEnabled()) return;
  void patchProducaoSuporteEspelhoPdv(rioPdvKey, options).catch((e) => {
    console.error("[suporte/espelho] patch PDV falhou", { rioPdvKey, err: e });
  });
}

export function scheduleProducaoSuporteEspelhoTelemetryRefresh(): void {
  if (!isSuporteEspelhoEnabled()) return;
  void refreshProducaoSuporteEspelhoTelemetry().catch((e) => {
    console.error("[suporte/espelho] refresh telemetria falhou", e);
  });
}
