import { prisma } from "@/lib/prisma";
import { resolvePdvProgramacaoAssignment } from "@/lib/criacao/pdvProgramacaoService";
import { resolveProgramacaoAndPlayerVersion } from "@/lib/cadastros/producaoPdvDisplay";
import {
  loadPlayerGatewayTelemetry,
  mergeGatewayTelemetry,
} from "@/lib/player/loadPlayerGatewayTelemetry";
import type { DashboardPdvTelemetry } from "@/lib/cadastros/producaoDashboardService";

export type InstalacaoPdvStatus = {
  rioPdvKey: string;
  portalPdvId: number;
  codigoDisplay: string;
  pdvNome: string;
  statusPlayer: "Ativo" | "Inativo";
  playerInstalacaoToken: string | null;
  playerVersion: string | null;
  programacaoCriacaoNome: string | null;
  telemetriaDisponivel: boolean;
  telemetry: DashboardPdvTelemetry;
};

export async function loadInstalacaoPdvStatus(input: {
  rioPdvKey: string;
  portalPdvId: number;
  pdvNome: string;
  codigoDisplay: string;
  clienteKey?: string | null;
}): Promise<InstalacaoPdvStatus> {
  const cadastro = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey: input.rioPdvKey },
    select: {
      statusPlayer: true,
      versaoPlayer: true,
      playerInstalacaoToken: true,
      programacaoId: true,
      programacaoMusical: true,
      programacao: { select: { id: true, nome: true, clienteRef: true } },
    },
  });

  let programacaoCriacaoNome: string | null = null;
  if (cadastro && input.clienteKey) {
    const programacoes = await prisma.programacao.findMany({
      where: { clienteRef: input.clienteKey },
      select: { id: true, nome: true, clienteRef: true },
      orderBy: { nome: "asc" },
    });
    const byCliente = new Map<string, Array<{ id: string; nome: string }>>();
    for (const prog of programacoes) {
      const list = byCliente.get(prog.clienteRef) ?? [];
      list.push({ id: prog.id, nome: prog.nome });
      byCliente.set(prog.clienteRef, list);
    }
    programacaoCriacaoNome = resolvePdvProgramacaoAssignment(
      cadastro,
      input.clienteKey,
      byCliente.get(input.clienteKey) ?? [],
    ).programacaoNome;
  }

  const { playerVersion: cadPlayerVersion } = resolveProgramacaoAndPlayerVersion({
    programacaoMusical: cadastro?.programacaoMusical ?? "Padrão",
    versaoPlayer: cadastro?.versaoPlayer,
  });

  const gateway = await loadPlayerGatewayTelemetry([input.portalPdvId]);

  return {
    rioPdvKey: input.rioPdvKey,
    portalPdvId: input.portalPdvId,
    codigoDisplay: input.codigoDisplay,
    pdvNome: input.pdvNome,
    statusPlayer: cadastro?.statusPlayer ?? "Ativo",
    playerInstalacaoToken: cadastro?.playerInstalacaoToken?.trim() || null,
    playerVersion: cadPlayerVersion,
    programacaoCriacaoNome,
    telemetriaDisponivel: gateway.ok,
    telemetry: mergeGatewayTelemetry(input.portalPdvId, gateway.byPdvId, cadPlayerVersion),
  };
}

export async function loadInstalacaoPdvStatusBatch(
  items: Array<{
    rioPdvKey: string;
    portalPdvId: number;
    pdvNome: string;
    codigoDisplay: string;
    clienteKey?: string | null;
  }>,
): Promise<InstalacaoPdvStatus[]> {
  if (items.length === 0) return [];

  const rioPdvKeys = items.map((i) => i.rioPdvKey);
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: rioPdvKeys } },
    select: {
      rioPdvKey: true,
      statusPlayer: true,
      versaoPlayer: true,
      playerInstalacaoToken: true,
      programacaoId: true,
      programacaoMusical: true,
      programacao: { select: { id: true, nome: true, clienteRef: true } },
    },
  });
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const clienteKeys = [...new Set(items.map((i) => i.clienteKey).filter(Boolean))] as string[];
  const programacoesByCliente = new Map<string, Array<{ id: string; nome: string }>>();
  if (clienteKeys.length > 0) {
    const programacoes = await prisma.programacao.findMany({
      where: { clienteRef: { in: clienteKeys } },
      select: { id: true, nome: true, clienteRef: true },
      orderBy: { nome: "asc" },
    });
    for (const prog of programacoes) {
      const list = programacoesByCliente.get(prog.clienteRef) ?? [];
      list.push({ id: prog.id, nome: prog.nome });
      programacoesByCliente.set(prog.clienteRef, list);
    }
  }

  const portalPdvIds = items.map((i) => i.portalPdvId);
  const gateway = await loadPlayerGatewayTelemetry(portalPdvIds);

  return items.map((item) => {
    const cadastro = cadastroByKey.get(item.rioPdvKey);
    let programacaoCriacaoNome: string | null = null;
    if (cadastro && item.clienteKey) {
      programacaoCriacaoNome = resolvePdvProgramacaoAssignment(
        cadastro,
        item.clienteKey,
        programacoesByCliente.get(item.clienteKey) ?? [],
      ).programacaoNome;
    }
    const { playerVersion: cadPlayerVersion } = resolveProgramacaoAndPlayerVersion({
      programacaoMusical: cadastro?.programacaoMusical ?? "Padrão",
      versaoPlayer: cadastro?.versaoPlayer,
    });
    return {
      rioPdvKey: item.rioPdvKey,
      portalPdvId: item.portalPdvId,
      codigoDisplay: item.codigoDisplay,
      pdvNome: item.pdvNome,
      statusPlayer: cadastro?.statusPlayer ?? "Ativo",
      playerInstalacaoToken: cadastro?.playerInstalacaoToken?.trim() || null,
      playerVersion: cadPlayerVersion,
      programacaoCriacaoNome,
      telemetriaDisponivel: gateway.ok,
      telemetry: mergeGatewayTelemetry(item.portalPdvId, gateway.byPdvId, cadPlayerVersion),
    };
  });
}
