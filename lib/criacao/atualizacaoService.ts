import { Prisma, TipoSubidaAtualizacao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicarProgramacao } from "@/lib/criacao/publicarService";
import { getClientePdvProgramacoes, prepareDisparoProgramacao } from "@/lib/criacao/pdvProgramacaoService";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";
import { appendFechamentoPainel } from "@/lib/criacao/atualizacaoPainelService";
import { competenciaFromDate, mesNomeCurtoFromDate } from "@/lib/criacao/competencia";

export type FaixaLogItem = {
  musicaId: string;
  titulo: string;
  artista: string;
  pastaNome: string;
};

export type AtualizacaoDiff = {
  entraram: FaixaLogItem[];
  sairam: FaixaLogItem[];
};

export type ProgramacaoSnapshot = {
  faixas: Record<string, FaixaLogItem>;
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
  tipoSubida?: "atl" | "especial";
  especialNome?: string;
};

export type FecharAtualizacaoInfo = {
  revisionAtual: number;
  isInstall: boolean;
  atlSugerido: string;
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

export async function getFecharAtualizacaoInfo(programacaoId: string): Promise<FecharAtualizacaoInfo> {
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

  const pdvsNomes = await pdvsNomesForProgramacao(programacaoId, prog.clienteRef);
  const isInstall = prog.revisionAtual === 0;

  return {
    revisionAtual: prog.revisionAtual,
    isInstall,
    atlSugerido: isInstall ? "INSTALL" : await previewRotuloAtl(programacaoId),
    programacaoNome: prog.nome,
    clienteNome: prog.clienteNome,
    pdvsAmarrados: pdvsNomes.length,
    pdvsNomes,
  };
}

export async function buildProgramacaoSnapshot(programacaoId: string): Promise<ProgramacaoSnapshot> {
  const pastas = await prisma.pasta.findMany({
    where: { programacaoId },
    select: {
      nome: true,
      musicas: {
        select: {
          musica: { select: { id: true, titulo: true, artista: true } },
        },
      },
    },
  });

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
  return { faixas };
}

function parseSnapshot(raw: Prisma.JsonValue | null): ProgramacaoSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { faixas: {} };
  const faixasRaw = (raw as { faixas?: unknown }).faixas;
  if (!faixasRaw || typeof faixasRaw !== "object" || Array.isArray(faixasRaw)) return { faixas: {} };
  const faixas: Record<string, FaixaLogItem> = {};
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
  return { faixas };
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
  return { entraram, sairam };
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
      },
      musicasPublicadas: r.musicasPublicadas,
      playlistsPublicadas: r.playlistsPublicadas,
    };
  });
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
