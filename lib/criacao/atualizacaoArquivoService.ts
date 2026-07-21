import { Prisma, TipoSubidaAtualizacao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AtualizacaoDiff, FaixaLogItem } from "@/lib/criacao/atualizacaoService";

type AtualizacaoRowLike = {
  id: string;
  programacaoId: string;
  codigo: string;
  tipoSubida: TipoSubidaAtualizacao;
  especialNome: string;
  competencia: string;
  rotuloLog: string;
  clienteNomeLog: string;
  programacaoNomeLog: string;
  pdvsLog: string;
  revision: number;
  disparadaEm: Date;
  disparadaPor: string;
  diffJson: Prisma.JsonValue;
  snapshotJson: Prisma.JsonValue;
  musicasPublicadas: number;
  playlistsPublicadas: number;
};

function parseDiff(raw: Prisma.JsonValue): AtualizacaoDiff {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const faixas = (arr: unknown): FaixaLogItem[] =>
    Array.isArray(arr) ?
      arr
        .filter((x) => x && typeof x === "object")
        .map((x) => x as FaixaLogItem)
        .filter((x) => typeof x.musicaId === "string")
    : [];
  return {
    entraram: faixas(d.entraram),
    sairam: faixas(d.sairam),
    cronogramasEntraram: [],
    cronogramasSairam: [],
  };
}

export function offMusicaIdsFromDiff(diff: AtualizacaoDiff): string[] {
  const ids = new Set<string>();
  for (const f of diff.sairam) {
    if (f.musicaId) ids.add(f.musicaId);
  }
  return [...ids];
}

export async function archiveProgramacaoAtualizacao(
  clienteRef: string,
  row: AtualizacaoRowLike,
): Promise<void> {
  const ref = clienteRef.trim();
  if (!ref) return;

  await prisma.clienteProgramacaoAtualizacaoArquivo.upsert({
    where: { programacaoAtualizacaoId: row.id },
    create: {
      clienteRef: ref,
      programacaoId: row.programacaoId,
      programacaoAtualizacaoId: row.id,
      codigo: row.codigo,
      tipoSubida: row.tipoSubida,
      especialNome: row.especialNome,
      competencia: row.competencia,
      rotuloLog: row.rotuloLog,
      clienteNomeLog: row.clienteNomeLog,
      programacaoNomeLog: row.programacaoNomeLog,
      pdvsLog: row.pdvsLog,
      revision: row.revision,
      disparadaEm: row.disparadaEm,
      disparadaPor: row.disparadaPor,
      diffJson: row.diffJson as Prisma.InputJsonValue,
      snapshotJson: row.snapshotJson as Prisma.InputJsonValue,
      musicasPublicadas: row.musicasPublicadas,
      playlistsPublicadas: row.playlistsPublicadas,
    },
    update: {
      clienteRef: ref,
      programacaoId: row.programacaoId,
      codigo: row.codigo,
      tipoSubida: row.tipoSubida,
      rotuloLog: row.rotuloLog,
      diffJson: row.diffJson as Prisma.InputJsonValue,
      snapshotJson: row.snapshotJson as Prisma.InputJsonValue,
      programacaoExcluidaEm: null,
    },
  });
}

/** Antes de apagar a programação: garante cópia no arquivo e marca exclusão. */
export async function archiveProgramacaoLogsBeforeDelete(programacaoId: string): Promise<void> {
  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true, clienteRef: true },
  });
  if (!prog) return;

  const rows = await prisma.programacaoAtualizacao.findMany({
    where: { programacaoId },
  });

  const now = new Date();
  for (const row of rows) {
    await archiveProgramacaoAtualizacao(prog.clienteRef, row);
  }

  await prisma.clienteProgramacaoAtualizacaoArquivo.updateMany({
    where: { programacaoId },
    data: {
      programacaoId: null,
      programacaoExcluidaEm: now,
    },
  });
}

export type ClienteAtualizacaoArquivoView = {
  id: string;
  programacaoAtualizacaoId: string;
  programacaoId: string | null;
  programacaoNome: string;
  programacaoExcluida: boolean;
  codigo: string;
  rotulo: string;
  tipoSubida: TipoSubidaAtualizacao;
  competencia: string;
  revision: number;
  disparadaEm: string;
  disparadaPor: string;
  pdvsLog: string;
  diff: AtualizacaoDiff;
};

export async function listClienteAtualizacaoArquivo(
  clienteRefs: string | string[],
  limit = 80,
): Promise<ClienteAtualizacaoArquivoView[]> {
  const refs = [...new Set((Array.isArray(clienteRefs) ? clienteRefs : [clienteRefs]).map((r) => r.trim()).filter(Boolean))];
  if (refs.length === 0) return [];

  const rows = await prisma.clienteProgramacaoAtualizacaoArquivo.findMany({
    where: { clienteRef: { in: refs } },
    orderBy: { disparadaEm: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });

  return rows.map((r) => ({
    id: r.id,
    programacaoAtualizacaoId: r.programacaoAtualizacaoId,
    programacaoId: r.programacaoId,
    programacaoNome: r.programacaoNomeLog,
    programacaoExcluida: r.programacaoId == null && r.programacaoExcluidaEm != null,
    codigo: r.codigo,
    rotulo: r.rotuloLog || r.codigo,
    tipoSubida: r.tipoSubida,
    competencia: r.competencia,
    revision: r.revision,
    disparadaEm: r.disparadaEm.toISOString(),
    disparadaPor: r.disparadaPor,
    pdvsLog: r.pdvsLog,
    diff: parseDiff(r.diffJson),
  }));
}

export type BibliotecaOffSidebarItem = {
  archiveId: string;
  rotulo: string;
  competencia: string;
  musicaCount: number;
  programacaoId: string | null;
  programacaoNome: string;
  programacaoExcluida: boolean;
};

export async function listOffArquivoForBibliotecaSidebar(): Promise<{
  byProgramacaoId: Map<string, BibliotecaOffSidebarItem[]>;
  arquivadas: { programacaoNome: string; clienteNome: string; offs: BibliotecaOffSidebarItem[] }[];
}> {
  const rows = await prisma.clienteProgramacaoAtualizacaoArquivo.findMany({
    where: { tipoSubida: "off" },
    orderBy: [{ competencia: "desc" }, { disparadaEm: "desc" }],
    take: 500,
  });

  const byProgramacaoId = new Map<string, BibliotecaOffSidebarItem[]>();
  const arquivadasMap = new Map<string, BibliotecaOffSidebarItem[]>();

  for (const r of rows) {
    const diff = parseDiff(r.diffJson);
    const item: BibliotecaOffSidebarItem = {
      archiveId: r.id,
      rotulo: r.rotuloLog || r.codigo,
      competencia: r.competencia,
      musicaCount: offMusicaIdsFromDiff(diff).length,
      programacaoId: r.programacaoId,
      programacaoNome: r.programacaoNomeLog,
      programacaoExcluida: r.programacaoId == null && r.programacaoExcluidaEm != null,
    };

    if (r.programacaoId) {
      const list = byProgramacaoId.get(r.programacaoId) ?? [];
      list.push(item);
      byProgramacaoId.set(r.programacaoId, list);
    } else {
      const key = `${r.clienteNomeLog}::${r.programacaoNomeLog}`;
      const list = arquivadasMap.get(key) ?? [];
      list.push(item);
      arquivadasMap.set(key, list);
    }
  }

  const arquivadas = [...arquivadasMap.entries()].map(([key, offs]) => {
    const [clienteNome, programacaoNome] = key.split("::");
    return { programacaoNome: programacaoNome ?? "", clienteNome: clienteNome ?? "", offs };
  });

  return { byProgramacaoId, arquivadas };
}

export async function musicaIdsForOffArquivo(archiveId: string): Promise<string[]> {
  const row = await prisma.clienteProgramacaoAtualizacaoArquivo.findUnique({
    where: { id: archiveId },
    select: { tipoSubida: true, diffJson: true },
  });
  if (!row || row.tipoSubida !== "off") return [];
  return offMusicaIdsFromDiff(parseDiff(row.diffJson));
}

export async function offFaixasFromArquivo(archiveId: string): Promise<FaixaLogItem[]> {
  const row = await prisma.clienteProgramacaoAtualizacaoArquivo.findUnique({
    where: { id: archiveId },
    select: { tipoSubida: true, diffJson: true },
  });
  if (!row || row.tipoSubida !== "off") return [];
  return parseDiff(row.diffJson).sairam;
}
