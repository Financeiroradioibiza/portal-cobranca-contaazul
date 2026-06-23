import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicarProgramacao } from "@/lib/criacao/publicarService";
import { prepareDisparoProgramacao } from "@/lib/criacao/pdvProgramacaoService";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";

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
  revision: number;
  disparadaEm: string;
  disparadaPor: string;
  diff: AtualizacaoDiff;
  musicasPublicadas: number;
  playlistsPublicadas: number;
};

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

function slugCliente(nome: string): string {
  const s = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32);
  return s || "Cliente";
}

function brazilMonthYear(d: Date): { mes: string; yy: string } {
  const br = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mes = MESES_PT[br.getMonth()] ?? "Mes";
  const yy = String(br.getFullYear()).slice(-2);
  return { mes, yy };
}

/** Gera código tipo Radiolbiza-ATL-Junho-26.01 (sequência por cliente+mês). */
export async function gerarCodigoAtualizacao(
  programacaoId: string,
  clienteNome: string,
  when = new Date(),
): Promise<string> {
  const { mes, yy } = brazilMonthYear(when);
  const prefix = `${slugCliente(clienteNome)}-ATL-${mes}-${yy}.`;
  const existentes = await prisma.programacaoAtualizacao.findMany({
    where: { programacaoId, codigo: { startsWith: prefix } },
    select: { codigo: true },
  });
  const seq = existentes.length + 1;
  return `${prefix}${String(seq).padStart(2, "0")}`;
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
  revision: number;
  diff: AtualizacaoDiff;
  playlists: number;
  musicas: number;
  semArquivo: number;
  clienteGatewayNome: string;
  pdvsDisparados: number;
};

export async function dispararAtualizacao(
  programacaoId: string,
  disparadaPor: string,
): Promise<DispararAtualizacaoResult> {
  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: {
      id: true,
      clienteRef: true,
      clienteNome: true,
      revisionAtual: true,
      snapshotAtual: true,
    },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const { portalClienteId, portalPdvIds } = await prepareDisparoProgramacao(programacaoId);
  const gatewayId = portalClienteId;

  const snapshotAtual = await buildProgramacaoSnapshot(programacaoId);
  const snapshotAnterior = parseSnapshot(prog.snapshotAtual);
  const diff = computeAtualizacaoDiff(
    prog.revisionAtual > 0 ? snapshotAnterior : null,
    snapshotAtual,
  );

  const codigo = await gerarCodigoAtualizacao(programacaoId, prog.clienteNome);
  const pub = await publicarProgramacao(programacaoId, gatewayId, portalPdvIds);
  const revision = prog.revisionAtual + 1;
  const hasAberta = await hasAtualizacaoAbertaColumn();

  await prisma.$transaction([
    prisma.programacaoAtualizacao.create({
      data: {
        programacaoId,
        codigo,
        revision,
        disparadaPor: disparadaPor.slice(0, 200),
        diffJson: diff as unknown as Prisma.InputJsonValue,
        snapshotJson: snapshotAtual as unknown as Prisma.InputJsonValue,
        musicasPublicadas: pub.musicas,
        playlistsPublicadas: pub.playlists,
      },
    }),
    prisma.programacao.update({
      where: { id: programacaoId },
      data: {
        revisionAtual: revision,
        clienteGatewayId: gatewayId,
        snapshotAtual: snapshotAtual as unknown as Prisma.InputJsonValue,
        publicada: true,
        publishedAt: new Date(),
        ...(hasAberta ?
          { atualizacaoAbertaEm: null, atualizacaoAbertaPor: "" }
        : {}),
      },
    }),
  ]);

  return {
    ok: true,
    codigo,
    revision,
    diff,
    playlists: pub.playlists,
    musicas: pub.musicas,
    semArquivo: pub.semArquivo,
    clienteGatewayNome: pub.clienteGatewayNome,
    pdvsDisparados: portalPdvIds.length,
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
    }));
}
