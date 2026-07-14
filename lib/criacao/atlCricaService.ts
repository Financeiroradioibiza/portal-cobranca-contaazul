import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import {
  competenciaFromDate,
  listCompetenciasRecentes,
  parseCompetencia,
} from "@/lib/criacao/competencia";
import { listPainelCompetencia, type PainelRow } from "@/lib/criacao/atualizacaoPainelService";
import { hasAtualizacaoPainelTable } from "@/lib/criacao/atualizacaoPainelSchemaCompat";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";
import { ATL_CRICA_MIN_COMPETENCIA } from "@/lib/criacao/atlCricaConstants";
import { programacaoOwnedByEmail } from "@/lib/criacao/programacaoOwnership";

export type AtlCricaProgramacaoRow = PainelRow & {
  atualizacaoAberta: boolean;
  abertaPor: string;
  pastasCount: number;
  criativoUserId: string | null;
  criativoNomeDb: string;
};

export type AtlCricaClienteGroup = {
  clienteRef: string;
  clienteNome: string;
  programacoes: AtlCricaProgramacaoRow[];
  totalProgramacoes: number;
  subidas: number;
  entregues: number;
  fechadas: number;
  pendentes: number;
};

export type AtlCricaBoardPayload = {
  ok: true;
  competencia: string;
  competenciaAtual: string;
  competencias: string[];
  migrationPendente: boolean;
  sessionEmail: string;
  isAdmin: boolean;
  clientes: AtlCricaClienteGroup[];
  rows: AtlCricaProgramacaoRow[];
};

function competenciasDisponiveis(): string[] {
  const atual = competenciaFromDate();
  const recentes = listCompetenciasRecentes(24);
  const filtradas = recentes.filter((c) => c >= ATL_CRICA_MIN_COMPETENCIA);
  if (filtradas.length === 0) return [ATL_CRICA_MIN_COMPETENCIA];
  if (!filtradas.includes(atual) && atual >= ATL_CRICA_MIN_COMPETENCIA) {
    filtradas.unshift(atual);
  }
  return [...new Set(filtradas)].sort((a, b) => b.localeCompare(a));
}

function resolveCompetencia(raw: string | null | undefined): string {
  const parsed = parseCompetencia(raw);
  if (parsed && parsed >= ATL_CRICA_MIN_COMPETENCIA) return parsed;
  const atual = competenciaFromDate();
  return atual >= ATL_CRICA_MIN_COMPETENCIA ? atual : ATL_CRICA_MIN_COMPETENCIA;
}

function rollupCliente(rows: AtlCricaProgramacaoRow[]): AtlCricaClienteGroup[] {
  const map = new Map<string, AtlCricaProgramacaoRow[]>();
  for (const row of rows) {
    const list = map.get(row.clienteRef) ?? [];
    list.push(row);
    map.set(row.clienteRef, list);
  }

  const clientes: AtlCricaClienteGroup[] = [];
  for (const [clienteRef, progs] of map) {
    progs.sort((a, b) => a.programacaoNome.localeCompare(b.programacaoNome, "pt-BR"));
    const subidas = progs.filter((p) => p.subidaFila).length;
    const entregues = progs.filter((p) => p.criativoEntregue).length;
    const fechadas = progs.filter((p) => p.fechamentos.length > 0).length;
    const pendentes = progs.filter((p) => !p.subidaFila && p.fechamentos.length === 0).length;
    clientes.push({
      clienteRef,
      clienteNome: progs[0]?.clienteNome || clienteRef,
      programacoes: progs,
      totalProgramacoes: progs.length,
      subidas,
      entregues,
      fechadas,
      pendentes,
    });
  }

  return clientes.sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
}

export async function getAtlCricaBoard(opts: {
  competencia?: string | null;
  sessionEmail: string;
}): Promise<AtlCricaBoardPayload> {
  const competencia = resolveCompetencia(opts.competencia);
  const competenciaAtual = competenciaFromDate();
  const migrationPendente = !(await hasAtualizacaoPainelTable());
  const painelRows = await listPainelCompetencia(competencia);

  const hasAberta = await hasAtualizacaoAbertaColumn();
  const progIds = painelRows.map((r) => r.programacaoId);
  const progMeta = progIds.length
    ? await prisma.programacao.findMany({
        where: { id: { in: progIds } },
        select: {
          id: true,
          criativoUserId: true,
          criativoNome: true,
          atualizacaoAbertaEm: true,
          atualizacaoAbertaPor: true,
          _count: { select: { pastas: true } },
        },
      })
    : [];
  const metaById = new Map(progMeta.map((p) => [p.id, p]));

  const rows: AtlCricaProgramacaoRow[] = painelRows.map((r) => {
    const meta = metaById.get(r.programacaoId);
    return {
      ...r,
      atualizacaoAberta: hasAberta ? Boolean(meta?.atualizacaoAbertaEm) : false,
      abertaPor: meta?.atualizacaoAbertaPor ?? "",
      pastasCount: meta?._count.pastas ?? 0,
      criativoUserId: meta?.criativoUserId ?? null,
      criativoNomeDb: meta?.criativoNome ?? "",
    };
  });

  const sessionEmail = normalizePortalEmail(opts.sessionEmail);
  const filtered = rows.filter((r) =>
    programacaoOwnedByEmail({ criativoUserId: r.criativoUserId }, sessionEmail),
  );

  return {
    ok: true,
    competencia,
    competenciaAtual,
    competencias: competenciasDisponiveis(),
    migrationPendente,
    sessionEmail,
    isAdmin: false,
    clientes: rollupCliente(filtered),
    rows: filtered,
  };
}
