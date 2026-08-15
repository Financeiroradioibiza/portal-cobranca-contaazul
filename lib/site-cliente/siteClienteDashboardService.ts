import { prisma } from "@/lib/prisma";
import { getProducaoDashboard, type DashboardPdvRow } from "@/lib/cadastros/producaoDashboardService";
import { getProducaoCatalogLayout } from "@/lib/cadastros/producaoLayoutService";
import { getProgramacao } from "@/lib/criacao/programacaoService";
import { listAgendamentos, type AgendamentoRow } from "@/lib/criacao/agendamentoService";
import { listVotosFeed } from "@/lib/criacao/musicaVotoService";
import { listClienteAtualizacaoArquivo } from "@/lib/criacao/atualizacaoArquivoService";
import type { SiteClienteSessionPayload } from "@/lib/site-cliente/session";
import type { SiteClientePermissoes } from "@/lib/site-cliente/permissions";
import {
  buildSemanaBlocos,
  resolveEstiloAgora,
  type SemanaBloco,
} from "@/lib/site-cliente/estiloAgora";
import {
  computePdvPlayStatus,
  type PdvPlayStatus,
} from "@/lib/site-cliente/pdvStatus";
import { horariosParaPasta, horariosParaVinheta, type PastaHorarioView } from "@/lib/site-cliente/pastaHorarios";
import { siteClienteHasLogo } from "@/lib/site-cliente/clienteLogoService";

export type SiteClientePdvRow = {
  rioPdvKey: string;
  nome: string;
  cnpj: string;
  clienteNome: string;
  clienteKey: string;
  rioLinhaId: string;
  cachePercent: number | null;
  status: PdvPlayStatus;
  firstPingAt: string | null;
  lastPingAt: string | null;
  playerVersion: string | null;
  programacaoMusical: string;
  programacaoNome: string | null;
  estiloAgora: string | null;
  programacaoId: string | null;
  agendamentos: Array<{
    pastaNome: string;
    diasSemana: string;
    horaInicio: string;
    horaFim: string;
  }>;
};

export type SiteClienteProgramacaoResumo = {
  programacaoId: string;
  nome: string;
  totalFaixas: number;
  totalHoras: number;
  pastas: Array<{
    nome: string;
    faixas: number;
    duracaoMinutos: number;
    selecionavel: boolean;
    horarios: PastaHorarioView[];
  }>;
  vinhetas: Array<{
    nome: string;
    tipo: string;
    horarios: PastaHorarioView[];
  }>;
  percentNovasAtl: number | null;
  ultimaAtualizacao: string | null;
  ultimaAtualizacaoRotulo: string | null;
};

export type SiteClienteFeedbackRow = {
  id: string;
  pdvNome: string;
  mensagem: string;
  quando: string;
};

export type SiteClienteVotoRow = {
  id: string;
  musicaTitulo: string;
  musicaArtista: string;
  pdvNome: string;
  voto: "like" | "dislike";
  quando: string;
};

export type SiteClienteAtualizacaoRow = {
  id: string;
  rotulo: string;
  quando: string;
  tipo: string;
  detalhe: string | null;
};

export type SiteClienteMoodboardView = {
  rioLinhaId: string;
  perfilPublico: string;
  posicionamentoMarca: string;
  estiloMusicalPrincipal: string;
  objetivoPeriodo: string;
};

export type SiteClienteClienteBlock = {
  key: string;
  nome: string;
  rioLinhaId: string;
  documento: string | null;
  logoUrl: string | null;
  pdvs: SiteClientePdvRow[];
  programacoes: SiteClienteProgramacaoResumo[];
  feedbacks: SiteClienteFeedbackRow[];
  votos: SiteClienteVotoRow[];
  atualizacoes: SiteClienteAtualizacaoRow[];
  semanaBlocos: SemanaBloco[];
  moodboard: SiteClienteMoodboardView | null;
};

export type SiteClienteDashboardPayload = {
  ok: true;
  grupoNome: string;
  usuarioNome: string;
  permissoes: SiteClientePermissoes;
  geradoEm: string;
  clientes: SiteClienteClienteBlock[];
};

function msToHours(ms: number): number {
  return Math.round((ms / 3600000) * 10) / 10;
}

async function loadGrupoScope(grupoId: string): Promise<{
  clienteKeys: Set<string>;
  pdvKeys: Set<string>;
}> {
  const g = await prisma.siteClienteGrupo.findUnique({
    where: { id: grupoId },
    include: { clientes: true, pdvs: true },
  });
  if (!g) return { clienteKeys: new Set(), pdvKeys: new Set() };

  return {
    /** Valor gravado em rio_linha_id = key do bucket na produção (pode ser custom:…). */
    clienteKeys: new Set(g.clientes.map((c) => c.rioLinhaId)),
    pdvKeys: new Set(g.pdvs.map((p) => p.rioPdvKey)),
  };
}

function clienteNoEscopo(
  clienteKey: string,
  rioLinhaId: string,
  pdvs: DashboardPdvRow[],
  clienteKeys: Set<string>,
  pdvKeys: Set<string>,
): boolean {
  if (clienteKeys.has(clienteKey) || (rioLinhaId && clienteKeys.has(rioLinhaId))) return true;
  return pdvs.some((p) => pdvKeys.has(p.rioPdvKey));
}

function filterPdvs(
  pdvs: DashboardPdvRow[],
  clienteKeys: Set<string>,
  pdvKeys: Set<string>,
  clienteKey: string,
  rioLinhaId: string,
): DashboardPdvRow[] {
  if (clienteKeys.has(clienteKey) || (rioLinhaId && clienteKeys.has(rioLinhaId))) return pdvs;
  return pdvs.filter((p) => pdvKeys.has(p.rioPdvKey));
}

async function buildProgramacaoResumo(
  programacaoId: string,
  agendamentos: AgendamentoRow[] = [],
): Promise<SiteClienteProgramacaoResumo | null> {
  const prog = await getProgramacao(programacaoId);
  if (!prog) return null;

  let totalMs = 0;
  let totalFaixas = 0;
  const pastas = prog.pastas.map((pasta) => {
    let dur = 0;
    for (const m of pasta.musicas) {
      dur += m.durationMs ?? 0;
      totalFaixas += 1;
    }
    totalMs += dur;
    return {
      nome: pasta.nome,
      faixas: pasta.musicas.length,
      duracaoMinutos: Math.round(dur / 60000),
      selecionavel: pasta.selecionavel,
      horarios: horariosParaPasta(pasta.nome, agendamentos, pasta.selecionavel),
    };
  });

  const vinhetasRows = await prisma.vinheta.findMany({
    where: { programacaoId },
    select: { nome: true, tipo: true },
    orderBy: { nome: "asc" },
  });
  const vinhetas = vinhetasRows.map((v) => ({
    nome: v.nome,
    tipo: v.tipo,
    horarios: horariosParaVinheta(v.nome, agendamentos),
  }));

  const [ultAtl, ultAny] = await Promise.all([
    prisma.programacaoAtualizacao.findFirst({
      where: { programacaoId, tipoSubida: "atl" },
      orderBy: { disparadaEm: "desc" },
      select: { disparadaEm: true, codigo: true, diffJson: true, musicasPublicadas: true },
    }),
    prisma.programacaoAtualizacao.findFirst({
      where: { programacaoId, NOT: { tipoSubida: "install" } },
      orderBy: { disparadaEm: "desc" },
      select: { disparadaEm: true, codigo: true },
    }),
  ]);

  let percentNovasAtl: number | null = null;
  if (ultAtl && totalFaixas > 0) {
    try {
      const diff = ultAtl.diffJson as { entraram?: unknown[] } | null;
      const entraram = Array.isArray(diff?.entraram) ? diff!.entraram!.length : ultAtl.musicasPublicadas;
      percentNovasAtl = Math.min(100, Math.round((entraram / totalFaixas) * 100));
    } catch {
      percentNovasAtl = null;
    }
  }

  return {
    programacaoId,
    nome: prog.nome,
    totalFaixas,
    totalHoras: msToHours(totalMs),
    pastas,
    vinhetas,
    percentNovasAtl,
    ultimaAtualizacao: ultAny?.disparadaEm.toISOString() ?? null,
    ultimaAtualizacaoRotulo: ultAny?.codigo ?? null,
  };
}

export async function buildSiteClienteDashboard(
  session: SiteClienteSessionPayload,
): Promise<SiteClienteDashboardPayload> {
  const { clienteKeys, pdvKeys } = await loadGrupoScope(session.grupoId);
  const dash = await getProducaoDashboard();
  const perm = session.permissoes;
  const now = new Date();

  const cadastros =
    perm.verStatusPdvs || perm.verEstiloAgora || perm.verProgramacao || perm.verResumoProgramacao
      ? await prisma.producaoPdvCadastro.findMany({
          select: { rioPdvKey: true, programacaoId: true },
        })
      : [];
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const moodboards = perm.verMoodboard
    ? await prisma.siteClienteMoodboard.findMany({ where: { grupoId: session.grupoId } })
    : [];
  const moodByKey = new Map(moodboards.map((m) => [m.rioLinhaId, m]));

  const programacaoCache = new Map<string, SiteClienteProgramacaoResumo | null>();
  const agCache = new Map<string, Awaited<ReturnType<typeof listAgendamentos>>>();
  const programacaoNomeCache = new Map<string, string>();

  async function programacaoNomeById(programacaoId: string): Promise<string | null> {
    if (!programacaoNomeCache.has(programacaoId)) {
      const row = await prisma.programacao.findUnique({
        where: { id: programacaoId },
        select: { nome: true },
      });
      programacaoNomeCache.set(programacaoId, row?.nome ?? "");
    }
    const nome = programacaoNomeCache.get(programacaoId) ?? "";
    return nome.trim() || null;
  }

  async function programacaoForPdv(pdvKey: string): Promise<{
    id: string | null;
    resumo: SiteClienteProgramacaoResumo | null;
    agendamentos: Awaited<ReturnType<typeof listAgendamentos>>;
  }> {
    const cad = cadastroByKey.get(pdvKey);
    const pid = cad?.programacaoId ?? null;
    if (!pid) return { id: null, resumo: null, agendamentos: [] };

    if (!agCache.has(pid)) {
      agCache.set(pid, perm.verProgramacao || perm.verEstiloAgora || perm.verGraficoSemana ? await listAgendamentos(pid) : []);
    }
    const agendamentos = agCache.get(pid) ?? [];

    if (perm.verResumoProgramacao && !programacaoCache.has(pid)) {
      programacaoCache.set(pid, await buildProgramacaoResumo(pid, agendamentos));
    }

    return {
      id: pid,
      resumo: programacaoCache.get(pid) ?? null,
      agendamentos,
    };
  }

  const clientesFiltrados = dash.clientes.filter((c) => {
    if (clienteKeys.size === 0 && pdvKeys.size === 0) return false;
    return clienteNoEscopo(c.key, c.rioLinhaId, c.pdvs, clienteKeys, pdvKeys);
  });

  const layout = await getProducaoCatalogLayout();
  const clienteIdMap = layout.portalClienteIdsByBucketKey;

  const [feedVotos, ingestRows] = await Promise.all([
    perm.verLikes ? listVotosFeed({ limit: 500 }) : Promise.resolve([]),
    perm.verFeedback
      ? prisma.playerIngest.findMany({
          where: {
            tipo: "feedback",
            rioPdvKey: {
              in: clientesFiltrados.flatMap((c) =>
                filterPdvs(c.pdvs, clienteKeys, pdvKeys, c.key, c.rioLinhaId).map((p) => p.rioPdvKey),
              ),
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const blocks: SiteClienteClienteBlock[] = [];

  for (const c of clientesFiltrados) {
    const pdvsRaw = filterPdvs(c.pdvs, clienteKeys, pdvKeys, c.key, c.rioLinhaId);
    const pdvRows: SiteClientePdvRow[] = [];

    const programacaoIds = new Set<string>();
    for (const p of pdvsRaw) {
      const pid = cadastroByKey.get(p.rioPdvKey)?.programacaoId;
      if (pid) programacaoIds.add(pid);
    }

    let semanaBlocos: SemanaBloco[] = [];

    for (const p of pdvsRaw) {
      const progInfo = await programacaoForPdv(p.rioPdvKey);
      const programacaoNome =
        progInfo.id != null
          ? (progInfo.resumo?.nome ?? (await programacaoNomeById(progInfo.id)))
          : null;

      pdvRows.push({
        rioPdvKey: p.rioPdvKey,
        nome: p.nome,
        cnpj: p.cnpj,
        clienteNome: c.nome,
        clienteKey: c.key,
        rioLinhaId: c.rioLinhaId,
        cachePercent: p.telemetry.downloadPercent,
        status: perm.verStatusPdvs ? computePdvPlayStatus(p.telemetry.firstPingAt, p.telemetry.lastPingAt, now) : "offline",
        firstPingAt: p.telemetry.firstPingAt,
        lastPingAt: p.telemetry.lastPingAt,
        playerVersion: p.telemetry.playerVersion,
        programacaoMusical: p.programacaoMusical,
        programacaoNome,
        estiloAgora:
          perm.verEstiloAgora ? resolveEstiloAgora(progInfo.agendamentos, now) : null,
        programacaoId: progInfo.id,
        agendamentos:
          perm.verProgramacao
            ? progInfo.agendamentos
                .filter((a) => a.ativo && a.alvoTipo === "pasta")
                .map((a) => ({
                  pastaNome: a.alvoNome,
                  diasSemana: a.diasSemana,
                  horaInicio: a.horaInicio,
                  horaFim: a.horaFim,
                }))
            : [],
      });
    }

    const programacoes: SiteClienteProgramacaoResumo[] = [];
    if (perm.verResumoProgramacao) {
      for (const pid of programacaoIds) {
        if (!agCache.has(pid)) {
          agCache.set(pid, await listAgendamentos(pid));
        }
        const agendamentos = agCache.get(pid) ?? [];
        if (!programacaoCache.has(pid)) {
          programacaoCache.set(pid, await buildProgramacaoResumo(pid, agendamentos));
        }
        const resumo = programacaoCache.get(pid);
        if (resumo) programacoes.push(resumo);
      }
      programacoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }

    if (perm.verGraficoSemana) {
      const blocoKey = new Set<string>();
      for (const pid of programacaoIds) {
        const agendamentos = agCache.get(pid) ?? [];
        for (const b of buildSemanaBlocos(agendamentos)) {
          const key = `${b.dia}|${b.horaInicio}|${b.pastaNome}`;
          if (blocoKey.has(key)) continue;
          blocoKey.add(key);
          semanaBlocos.push(b);
        }
      }
      semanaBlocos.sort((a, b) => a.dia - b.dia || a.horaInicio.localeCompare(b.horaInicio));
    }

    const portalClienteId = clienteIdMap[c.key] ?? null;

    const feedbacks: SiteClienteFeedbackRow[] = perm.verFeedback
      ? ingestRows
          .filter((r) => pdvsRaw.some((pdv) => pdv.rioPdvKey === r.rioPdvKey))
          .map((r) => ({
            id: r.id,
            pdvNome: r.pdvNome?.trim() || r.rioPdvKey || "—",
            mensagem: r.mensagem?.trim() || "—",
            quando: r.createdAt.toISOString(),
          }))
      : [];

    const votos: SiteClienteVotoRow[] =
      perm.verLikes && portalClienteId
        ? feedVotos
            .filter((v) => v.portalClienteId === portalClienteId)
            .map((v) => ({
              id: v.id,
              musicaTitulo: v.musicaTitulo,
              musicaArtista: v.musicaArtista,
              pdvNome: v.pdvNome,
              voto: v.voto,
              quando: v.createdAt,
            }))
        : [];

    let atualizacoes: SiteClienteAtualizacaoRow[] = [];
    if (perm.verAtualizacoes) {
      const arqs = await listClienteAtualizacaoArquivo([c.key, c.rioLinhaId], 40);
      atualizacoes = arqs
        .filter((a) => a.tipoSubida !== "install")
        .map((a) => ({
          id: a.id,
          rotulo: a.rotulo,
          quando: a.disparadaEm,
          tipo: a.tipoSubida,
          detalhe: a.disparadaPor ? `Por ${a.disparadaPor}` : null,
        }));
    }

    const mood = moodByKey.get(c.key) ?? (c.rioLinhaId ? moodByKey.get(c.rioLinhaId) : undefined);
    const hasLogo = await siteClienteHasLogo(session.grupoId, c.key, portalClienteId);
    blocks.push({
      key: c.key,
      nome: c.nome,
      rioLinhaId: c.rioLinhaId,
      documento: c.detail.documento,
      logoUrl: hasLogo ? `/api/site-cliente/logo/${encodeURIComponent(c.key)}` : null,
      pdvs: pdvRows,
      programacoes: perm.verResumoProgramacao ? programacoes : [],
      feedbacks,
      votos,
      atualizacoes,
      semanaBlocos: perm.verGraficoSemana ? semanaBlocos : [],
      moodboard:
        perm.verMoodboard && mood
          ? {
              rioLinhaId: mood.rioLinhaId,
              perfilPublico: mood.perfilPublico,
              posicionamentoMarca: mood.posicionamentoMarca,
              estiloMusicalPrincipal: mood.estiloMusicalPrincipal,
              objetivoPeriodo: mood.objetivoPeriodo,
            }
          : null,
    });
  }

  return {
    ok: true,
    grupoNome: session.grupoNome,
    usuarioNome: session.nome,
    permissoes: perm,
    geradoEm: now.toISOString(),
    clientes: blocks,
  };
}

export async function getSiteClienteMoodboardForUser(
  session: SiteClienteSessionPayload,
  rioLinhaId: string,
): Promise<SiteClienteMoodboardView | null> {
  if (!session.permissoes.verMoodboard) return null;

  const scope = await loadGrupoScope(session.grupoId);
  const allowed =
    scope.clienteKeys.has(rioLinhaId) ||
    scope.pdvKeys.size > 0;
  if (!allowed && scope.clienteKeys.size > 0) {
    return null;
  }

  const m = await prisma.siteClienteMoodboard.findUnique({
    where: { grupoId_rioLinhaId: { grupoId: session.grupoId, rioLinhaId } },
  });
  if (!m) return null;

  return {
    rioLinhaId: m.rioLinhaId,
    perfilPublico: m.perfilPublico,
    posicionamentoMarca: m.posicionamentoMarca,
    estiloMusicalPrincipal: m.estiloMusicalPrincipal,
    objetivoPeriodo: m.objetivoPeriodo,
  };
}
