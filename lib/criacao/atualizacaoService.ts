import { Prisma, TipoSubidaAtualizacao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicarProgramacao } from "@/lib/criacao/publicarService";
import { getClientePdvProgramacoes, prepareDisparoProgramacao } from "@/lib/criacao/pdvProgramacaoService";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";
import { appendFechamentoPainel } from "@/lib/criacao/atualizacaoPainelService";
import { ensureTipoSubidaOffEnum } from "@/lib/criacao/atualizacaoSchemaCompat";
import { competenciaFromDate, mesNomeCurtoFromDate } from "@/lib/criacao/competencia";

export type FaixaLogItem = {
  musicaId: string;
  titulo: string;
  artista: string;
  pastaNome: string;
};

export type CronogramaLogItem = {
  agendamentoId: string;
  alvoTipo: string;
  alvoNome: string;
  resumo: string;
};

export type AtualizacaoDiff = {
  entraram: FaixaLogItem[];
  sairam: FaixaLogItem[];
  cronogramasEntraram: CronogramaLogItem[];
  cronogramasSairam: CronogramaLogItem[];
};

export type ProgramacaoSnapshot = {
  faixas: Record<string, FaixaLogItem>;
  cronogramas: Record<string, CronogramaLogItem>;
};

export type AtualizacaoLogRow = {
  id: string;
  codigo: string;
  rotuloLog: string;
  tipoSubida: TipoSubidaAtualizacao;
  especialNome: string;
  competencia: string;
  clienteNomeLog: string;
  programacaoNomeLog: string;
  pdvsLog: string;
  revision: number;
  disparadaEm: string;
  disparadaPor: string;
  diff: AtualizacaoDiff;
  musicasPublicadas: number;
  playlistsPublicadas: number;
};

export type DispararAtualizacaoOpts = {
  tipoSubida?: "atl" | "especial" | "off";
  especialNome?: string;
};

export type FecharAtualizacaoInfo = {
  revisionAtual: number;
  isInstall: boolean;
  atlSugerido: string;
  offSugerido: string;
  programacaoNome: string;
  clienteNome: string;
  pdvsAmarrados: number;
  pdvsNomes: string[];
};

async function pdvsLogForProgramacao(programacaoId: string, clienteRef: string): Promise<string> {
  const payload = await getClientePdvProgramacoes(clienteRef);
  const nomes = payload.pdvs
    .filter((p) => p.programacaoId === programacaoId)
    .map((p) => p.nome.trim() || p.codigoDisplay)
    .filter(Boolean);
  return nomes.join(", ");
}

async function pdvsNomesForProgramacao(programacaoId: string, clienteRef: string): Promise<string[]> {
  const payload = await getClientePdvProgramacoes(clienteRef);
  return payload.pdvs
    .filter((p) => p.programacaoId === programacaoId)
    .map((p) => p.nome.trim() || p.codigoDisplay)
    .filter(Boolean);
}

/** Próximo rótulo ATL do mês: ATL Junho 1, ATL Junho 2… */
export async function previewRotuloAtl(programacaoId: string, when = new Date()): Promise<string> {
  const mes = mesNomeCurtoFromDate(when);
  const competencia = competenciaFromDate(when);
  const count = await prisma.programacaoAtualizacao.count({
    where: { programacaoId, competencia, tipoSubida: "atl" },
  });
  return `ATL ${mes} ${count + 1}`;
}

/** Próximo rótulo OFF do mês: OFF Julho 1, OFF Julho 2… (zera na competência seguinte). */
export async function previewRotuloOff(programacaoId: string, when = new Date()): Promise<string> {
  const mes = mesNomeCurtoFromDate(when);
  const competencia = competenciaFromDate(when);
  await ensureTipoSubidaOffEnum();
  try {
    const count = await prisma.programacaoAtualizacao.count({
      where: { programacaoId, competencia, tipoSubida: "off" },
    });
    return `OFF ${mes} ${count + 1}`;
  } catch {
    const count = await prisma.programacaoAtualizacao.count({
      where: { programacaoId, competencia, codigo: { startsWith: `OFF ${mes}` } },
    });
    return `OFF ${mes} ${count + 1}`;
  }
}

export async function getFecharAtualizacaoInfo(
  programacaoId: string,
  opts?: { clienteRef?: string },
): Promise<FecharAtualizacaoInfo> {
  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      clienteNome: true,
      revisionAtual: true,
    },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const clienteRef = (opts?.clienteRef?.trim() || prog.clienteRef).trim();
  const pdvsNomes = await pdvsNomesForProgramacao(programacaoId, clienteRef);
  const isInstall = prog.revisionAtual === 0;
  const when = new Date();

  await ensureTipoSubidaOffEnum();

  const [atlSugerido, offSugerido] =
    isInstall ?
      (["INSTALL", "INSTALL"] as const)
    : await Promise.all([previewRotuloAtl(programacaoId, when), previewRotuloOff(programacaoId, when)]);

  return {
    revisionAtual: prog.revisionAtual,
    isInstall,
    atlSugerido,
    offSugerido,
    programacaoNome: prog.nome,
    clienteNome: prog.clienteNome,
    pdvsAmarrados: pdvsNomes.length,
    pdvsNomes,
  };
}

export async function buildProgramacaoSnapshot(programacaoId: string): Promise<ProgramacaoSnapshot> {
  const [pastas, ags, vinhetas] = await Promise.all([
    prisma.pasta.findMany({
      where: { programacaoId },
      select: {
        id: true,
        nome: true,
        musicas: {
          select: {
            musica: { select: { id: true, titulo: true, artista: true } },
          },
        },
      },
    }),
    prisma.agendamento.findMany({
      where: { programacaoId },
      select: {
        id: true,
        alvoTipo: true,
        alvoId: true,
        diasSemana: true,
        horaInicio: true,
        horaFim: true,
        dataInicio: true,
        dataFim: true,
        frequenciaMin: true,
        frequenciaMusicas: true,
        ativo: true,
      },
    }),
    prisma.vinheta.findMany({
      where: { programacaoId },
      select: { id: true, nome: true },
    }),
  ]);

  const faixas: Record<string, FaixaLogItem> = {};
  for (const pasta of pastas) {
    for (const pm of pasta.musicas) {
      faixas[pm.musica.id] = {
        musicaId: pm.musica.id,
        titulo: pm.musica.titulo,
        artista: pm.musica.artista,
        pastaNome: pasta.nome,
      };
    }
  }

  const nomeAlvo = new Map<string, string>();
  for (const p of pastas) nomeAlvo.set(`pasta:${p.id}`, p.nome);
  for (const v of vinhetas) nomeAlvo.set(`vinheta:${v.id}`, v.nome);

  const cronogramas: Record<string, CronogramaLogItem> = {};
  for (const a of ags) {
    const alvoNome = nomeAlvo.get(`${a.alvoTipo}:${a.alvoId}`) ?? "(removido)";
    cronogramas[a.id] = {
      agendamentoId: a.id,
      alvoTipo: a.alvoTipo,
      alvoNome,
      resumo: formatCronogramaResumo(a),
    };
  }

  return { faixas, cronogramas };
}

const DOW_CRON = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diasSemanaLabel(csv: string): string {
  if (!csv.trim()) return "todos os dias";
  return csv
    .split(",")
    .map((n) => DOW_CRON[Number(n.trim())] ?? "")
    .filter(Boolean)
    .join(", ");
}

function formatPeriodoCronograma(dataInicio: Date | null, dataFim: Date | null): string | null {
  const ini = dataInicio ? dataInicio.toISOString().slice(0, 10) : null;
  const fim = dataFim ? dataFim.toISOString().slice(0, 10) : null;
  if (!ini && !fim) return null;
  if (ini && !fim) return `desde ${ini} (sem fim)`;
  if (!ini && fim) return `até ${fim}`;
  return `${ini} → ${fim}`;
}

function formatCronogramaResumo(a: {
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  dataInicio: Date | null;
  dataFim: Date | null;
  frequenciaMin: number | null;
  frequenciaMusicas: number | null;
  ativo: boolean;
}): string {
  const parts = [diasSemanaLabel(a.diasSemana), `${a.horaInicio}–${a.horaFim}`];
  const periodo = formatPeriodoCronograma(a.dataInicio, a.dataFim);
  if (periodo) parts.push(periodo);
  if (a.frequenciaMin) parts.push(`a cada ${a.frequenciaMin} min`);
  if (a.frequenciaMusicas) {
    parts.push(`a cada ${a.frequenciaMusicas} música${a.frequenciaMusicas === 1 ? "" : "s"}`);
  }
  if (!a.ativo) parts.push("pausado");
  return parts.join(" · ");
}

function parseSnapshot(raw: Prisma.JsonValue | null): ProgramacaoSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { faixas: {}, cronogramas: {} };
  const faixasRaw = (raw as { faixas?: unknown }).faixas;
  const cronRaw = (raw as { cronogramas?: unknown }).cronogramas;
  const faixas: Record<string, FaixaLogItem> = {};
  if (faixasRaw && typeof faixasRaw === "object" && !Array.isArray(faixasRaw)) {
    for (const [id, v] of Object.entries(faixasRaw as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const o = v as Record<string, unknown>;
      faixas[id] = {
        musicaId: id,
        titulo: String(o.titulo ?? ""),
        artista: String(o.artista ?? ""),
        pastaNome: String(o.pastaNome ?? ""),
      };
    }
  }
  const cronogramas: Record<string, CronogramaLogItem> = {};
  if (cronRaw && typeof cronRaw === "object" && !Array.isArray(cronRaw)) {
    for (const [id, v] of Object.entries(cronRaw as Record<string, unknown>)) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      const o = v as Record<string, unknown>;
      cronogramas[id] = {
        agendamentoId: String(o.agendamentoId ?? id),
        alvoTipo: String(o.alvoTipo ?? ""),
        alvoNome: String(o.alvoNome ?? ""),
        resumo: String(o.resumo ?? ""),
      };
    }
  }
  return { faixas, cronogramas };
}

function cronogramaFingerprint(c: CronogramaLogItem): string {
  return `${c.alvoTipo}:${c.alvoNome}:${c.resumo}`;
}

function sortCronogramas(xs: CronogramaLogItem[]): CronogramaLogItem[] {
  return [...xs].sort(
    (a, b) =>
      a.alvoNome.localeCompare(b.alvoNome) ||
      a.alvoTipo.localeCompare(b.alvoTipo) ||
      a.resumo.localeCompare(b.resumo),
  );
}

export function computeAtualizacaoDiff(
  anterior: ProgramacaoSnapshot | null,
  atual: ProgramacaoSnapshot,
): AtualizacaoDiff {
  const prev = anterior?.faixas ?? {};
  const curr = atual.faixas;
  const entraram: FaixaLogItem[] = [];
  const sairam: FaixaLogItem[] = [];

  for (const [id, f] of Object.entries(curr)) {
    if (!prev[id]) entraram.push(f);
  }
  for (const [id, f] of Object.entries(prev)) {
    if (!curr[id]) sairam.push(f);
  }

  entraram.sort((a, b) => a.pastaNome.localeCompare(b.pastaNome) || a.titulo.localeCompare(b.titulo));
  sairam.sort((a, b) => a.pastaNome.localeCompare(b.pastaNome) || a.titulo.localeCompare(b.titulo));

  const prevCron = anterior?.cronogramas ?? {};
  const currCron = atual.cronogramas ?? {};
  const cronogramasEntraram: CronogramaLogItem[] = [];
  const cronogramasSairam: CronogramaLogItem[] = [];

  for (const [id, c] of Object.entries(currCron)) {
    const old = prevCron[id];
    if (!old) {
      cronogramasEntraram.push(c);
    } else if (cronogramaFingerprint(old) !== cronogramaFingerprint(c)) {
      cronogramasSairam.push(old);
      cronogramasEntraram.push(c);
    }
  }
  for (const [id, c] of Object.entries(prevCron)) {
    if (!currCron[id]) cronogramasSairam.push(c);
  }

  return {
    entraram,
    sairam,
    cronogramasEntraram: sortCronogramas(cronogramasEntraram),
    cronogramasSairam: sortCronogramas(cronogramasSairam),
  };
}

function resolveSubida(
  revisionAtual: number,
  opts: DispararAtualizacaoOpts | undefined,
  programacaoId: string,
  when: Date,
): Promise<{ tipo: TipoSubidaAtualizacao; rotulo: string; especialNome: string }> {
  if (revisionAtual === 0) {
    return Promise.resolve({ tipo: "install", rotulo: "INSTALL", especialNome: "" });
  }
  if (opts?.tipoSubida === "especial") {
    const nome = (opts.especialNome ?? "").trim().toUpperCase();
    if (!nome) return Promise.reject(new Error("especial_nome_obrigatorio"));
    return Promise.resolve({ tipo: "especial", rotulo: `ESPECIAL ${nome}`, especialNome: nome });
  }
  if (opts?.tipoSubida === "off") {
    return previewRotuloOff(programacaoId, when).then((rotulo) => ({
      tipo: "off" as const,
      rotulo,
      especialNome: "",
    }));
  }
  return previewRotuloAtl(programacaoId, when).then((rotulo) => ({
    tipo: "atl" as const,
    rotulo,
    especialNome: "",
  }));
}

export async function listAtualizacoesLog(programacaoId: string): Promise<AtualizacaoLogRow[]> {
  const rows = await prisma.programacaoAtualizacao.findMany({
    where: { programacaoId },
    orderBy: { disparadaEm: "desc" },
    take: 100,
  });

  return rows.map((r) => {
    const diff = r.diffJson as AtualizacaoDiff;
    return {
      id: r.id,
      codigo: r.codigo,
      rotuloLog: r.rotuloLog || r.codigo,
      tipoSubida: r.tipoSubida,
      especialNome: r.especialNome,
      competencia: r.competencia,
      clienteNomeLog: r.clienteNomeLog,
      programacaoNomeLog: r.programacaoNomeLog,
      pdvsLog: r.pdvsLog,
      revision: r.revision,
      disparadaEm: r.disparadaEm.toISOString(),
      disparadaPor: r.disparadaPor,
      diff: {
        entraram: Array.isArray(diff?.entraram) ? diff.entraram : [],
        sairam: Array.isArray(diff?.sairam) ? diff.sairam : [],
        cronogramasEntraram: Array.isArray(diff?.cronogramasEntraram) ? diff.cronogramasEntraram : [],
        cronogramasSairam: Array.isArray(diff?.cronogramasSairam) ? diff.cronogramasSairam : [],
      },
      musicasPublicadas: r.musicasPublicadas,
      playlistsPublicadas: r.playlistsPublicadas,
    };
  });
}

export type RestoreProgramacaoResult = {
  ok: true;
  rotuloLog: string;
  faixasRestauradas: number;
  pastasAfetadas: number;
};

/** Restaura a montagem de pastas/faixas da programação a partir de um snapshot de log anterior. */
export async function restoreProgramacaoFromSnapshot(
  programacaoId: string,
  atualizacaoId: string,
  restoredBy: string,
): Promise<RestoreProgramacaoResult> {
  const row = await prisma.programacaoAtualizacao.findFirst({
    where: { id: atualizacaoId, programacaoId },
    select: { snapshotJson: true, rotuloLog: true, codigo: true },
  });
  if (!row) throw new Error("atualizacao_nao_encontrada");

  const snapshot = parseSnapshot(row.snapshotJson);
  const faixaList = Object.values(snapshot.faixas);
  if (faixaList.length === 0) throw new Error("snapshot_vazio");

  const pastaOrder: string[] = [];
  const byPasta = new Map<string, string[]>();
  for (const f of faixaList) {
    const nome = (f.pastaNome || "").trim() || "Sem pasta";
    if (!byPasta.has(nome)) {
      pastaOrder.push(nome);
      byPasta.set(nome, []);
    }
    const list = byPasta.get(nome)!;
    if (!list.includes(f.musicaId)) list.push(f.musicaId);
  }

  const snapshotIds = Array.from(new Set(faixaList.map((f) => f.musicaId)));
  const validIds = new Set(
    (
      await prisma.musicaBiblioteca.findMany({
        where: { id: { in: snapshotIds } },
        select: { id: true },
      })
    ).map((m) => m.id),
  );

  await prisma.$transaction(async (tx) => {
    const pastas = await tx.pasta.findMany({
      where: { programacaoId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, nome: true, sortOrder: true },
    });
    const pastaByNome = new Map(pastas.map((p) => [p.nome, p.id]));
    let nextSort = pastas.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;

    await tx.pastaMusica.deleteMany({
      where: { pasta: { programacaoId } },
    });

    const now = new Date();
    for (const pastaNome of pastaOrder) {
      const musicaIds = (byPasta.get(pastaNome) ?? []).filter((id) => validIds.has(id));
      if (musicaIds.length === 0) continue;

      let pastaId = pastaByNome.get(pastaNome);
      if (!pastaId) {
        const created = await tx.pasta.create({
          data: {
            programacaoId,
            nome: pastaNome.slice(0, 120),
            velocidade: "media",
            sortOrder: nextSort++,
          },
          select: { id: true },
        });
        pastaId = created.id;
        pastaByNome.set(pastaNome, pastaId);
      }

      await tx.pastaMusica.createMany({
        data: musicaIds.map((musicaId, idx) => ({
          pastaId: pastaId!,
          musicaId,
          sortOrder: idx,
          addedAt: now,
        })),
      });
    }

    await tx.programacao.update({
      where: { id: programacaoId },
      data: {
        snapshotAtual: row.snapshotJson as Prisma.InputJsonValue,
      },
    });
  });

  const afterCount = await prisma.pastaMusica.count({
    where: { pasta: { programacaoId } },
  });

  await abrirAtualizacao(programacaoId, restoredBy.slice(0, 200));

  return {
    ok: true,
    rotuloLog: row.rotuloLog || row.codigo,
    faixasRestauradas: afterCount,
    pastasAfetadas: pastaOrder.length,
  };
}

export type DispararAtualizacaoResult = {
  ok: true;
  codigo: string;
  rotuloLog: string;
  tipoSubida: TipoSubidaAtualizacao;
  revision: number;
  diff: AtualizacaoDiff;
  playlists: number;
  musicas: number;
  semArquivo: number;
  vinhetasSemAudio: number;
  clienteGatewayNome: string;
  pdvsDisparados: number;
  logResumo: string;
};

export async function dispararAtualizacao(
  programacaoId: string,
  disparadaPor: string,
  opts?: DispararAtualizacaoOpts,
): Promise<DispararAtualizacaoResult> {
  const when = new Date();
  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: {
      id: true,
      clienteRef: true,
      clienteNome: true,
      nome: true,
      revisionAtual: true,
      snapshotAtual: true,
    },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  await ensureTipoSubidaOffEnum();

  const { portalClienteId, portalPdvIds } = await prepareDisparoProgramacao(programacaoId);
  const gatewayId = portalClienteId;
  const pdvsLog = await pdvsLogForProgramacao(programacaoId, prog.clienteRef);
  const { tipo, rotulo, especialNome } = await resolveSubida(prog.revisionAtual, opts, programacaoId, when);
  const competencia = competenciaFromDate(when);

  const snapshotAtual = await buildProgramacaoSnapshot(programacaoId);
  const snapshotAnterior = parseSnapshot(prog.snapshotAtual);
  const diff = computeAtualizacaoDiff(
    prog.revisionAtual > 0 ? snapshotAnterior : null,
    snapshotAtual,
  );

  const codigo = rotulo;
  const pub = await publicarProgramacao(programacaoId, gatewayId, portalPdvIds);
  const revision = prog.revisionAtual + 1;
  const hasAberta = await hasAtualizacaoAbertaColumn();

  const logResumo = [
    rotulo,
    prog.clienteNome || prog.clienteRef,
    pdvsLog ? `PDV: ${pdvsLog}` : "PDV: —",
    prog.nome,
    when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  ].join(" · ");

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.programacaoAtualizacao.create({
      data: {
        programacaoId,
        codigo,
        rotuloLog: rotulo,
        tipoSubida: tipo,
        especialNome,
        competencia,
        clienteNomeLog: prog.clienteNome,
        programacaoNomeLog: prog.nome,
        pdvsLog,
        revision,
        disparadaPor: disparadaPor.slice(0, 200),
        diffJson: diff as unknown as Prisma.InputJsonValue,
        snapshotJson: snapshotAtual as unknown as Prisma.InputJsonValue,
        musicasPublicadas: pub.musicas,
        playlistsPublicadas: pub.playlists,
      },
    });
    await tx.programacao.update({
      where: { id: programacaoId },
      data: {
        revisionAtual: revision,
        clienteGatewayId: gatewayId,
        snapshotAtual: snapshotAtual as unknown as Prisma.InputJsonValue,
        publicada: true,
        publishedAt: when,
        ...(hasAberta ?
          { atualizacaoAbertaEm: null, atualizacaoAbertaPor: "" }
        : {}),
      },
    });
    return row;
  });

  await appendFechamentoPainel({
    programacaoId,
    competencia,
    atualizacaoId: created.id,
    rotulo,
    tipo,
    when,
  });

  return {
    ok: true,
    codigo,
    rotuloLog: rotulo,
    tipoSubida: tipo,
    revision,
    diff,
    playlists: pub.playlists,
    musicas: pub.musicas,
    semArquivo: pub.semArquivo,
    vinhetasSemAudio: pub.vinhetasSemAudio,
    clienteGatewayNome: pub.clienteGatewayNome,
    pdvsDisparados: portalPdvIds.length,
    logResumo,
  };
}

export type AtualizacaoAbertaRow = {
  programacaoId: string;
  programacaoNome: string;
  clienteRef: string;
  clienteNome: string;
  abertaEm: string;
  abertaPor: string;
  publicada: boolean;
  criativoUserId: string | null;
  criativoNome: string;
};

export async function abrirAtualizacao(
  programacaoId: string,
  abertaPor: string,
): Promise<{ ok: true; programacaoId: string }> {
  if (!(await hasAtualizacaoAbertaColumn())) {
    throw new Error("migration_pendente");
  }

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  await prisma.programacao.update({
    where: { id: programacaoId },
    data: {
      atualizacaoAbertaEm: new Date(),
      atualizacaoAbertaPor: abertaPor.slice(0, 200),
    },
  });

  return { ok: true, programacaoId };
}

export async function listAtualizacoesAbertas(): Promise<AtualizacaoAbertaRow[]> {
  if (!(await hasAtualizacaoAbertaColumn())) return [];

  const rows = await prisma.programacao.findMany({
    where: { atualizacaoAbertaEm: { not: null } },
    orderBy: { atualizacaoAbertaEm: "desc" },
    take: 50,
    select: {
      id: true,
      nome: true,
      clienteRef: true,
      clienteNome: true,
      publicada: true,
      atualizacaoAbertaEm: true,
      atualizacaoAbertaPor: true,
      criativoUserId: true,
      criativoNome: true,
    },
  });

  return rows
    .filter((r) => r.atualizacaoAbertaEm)
    .map((r) => ({
      programacaoId: r.id,
      programacaoNome: r.nome,
      clienteRef: r.clienteRef,
      clienteNome: r.clienteNome,
      abertaEm: r.atualizacaoAbertaEm!.toISOString(),
      abertaPor: r.atualizacaoAbertaPor,
      publicada: r.publicada,
      criativoUserId: r.criativoUserId ?? null,
      criativoNome: r.criativoNome ?? "",
    }));
}

/** @deprecated use previewRotuloAtl */
export async function gerarCodigoAtualizacao(
  programacaoId: string,
  _clienteNome: string,
  when = new Date(),
): Promise<string> {
  return previewRotuloAtl(programacaoId, when);
}
