import { prisma } from "@/lib/prisma";
import { resolvePdvProgramacaoAssignment } from "@/lib/criacao/pdvProgramacaoService";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";
import { resolveProgramacaoAndPlayerVersion } from "@/lib/cadastros/producaoPdvDisplay";
import { loadMergedProducaoPlayerContext } from "@/lib/player/producaoPlayerBuckets";
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

export type InstalacaoProgramacaoAlert = {
  nivel: "ok" | "amarelo" | "vermelho";
  titulo: string;
  mensagem: string;
  programacaoNome: string | null;
  programacaoAmarrada: boolean;
  programacaoFechada: boolean | null;
};

export type InstalacaoGeracaoGate = {
  podeGerarLink: boolean;
  errorCode: "pdv_sem_programacao_amarrada" | "pdv_com_player_instalado" | null;
  motivo: string | null;
  programacaoAlert: InstalacaoProgramacaoAlert;
  pdvComPlayerAtivo: boolean;
};

/** Trava geração de link/código no Suporte — exige programação amarrada e PDV sem player ativo. */
export async function loadInstalacaoGeracaoGate(input: {
  rioPdvKey: string;
  portalPdvId: number;
  playerInstaladoEm?: string | Date | null;
}): Promise<InstalacaoGeracaoGate> {
  const programacaoAlert = await loadInstalacaoProgramacaoAlert(input.rioPdvKey);

  if (!programacaoAlert.programacaoAmarrada) {
    return {
      podeGerarLink: false,
      errorCode: "pdv_sem_programacao_amarrada",
      motivo:
        "Este PDV não tem programação amarrada na Criação/Produção. Amarrar e publicar antes de gerar link ou código.",
      programacaoAlert,
      pdvComPlayerAtivo: false,
    };
  }

  const cadastro = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey: input.rioPdvKey },
    select: { playerInstaladoEm: true, playerInstalacaoToken: true },
  });

  const instaladoEm =
    input.playerInstaladoEm ?? cadastro?.playerInstaladoEm ?? null;

  const gateway = await loadPlayerGatewayTelemetry([input.portalPdvId]);
  const lastPingAt = gateway.byPdvId.get(input.portalPdvId)?.lastPingAt ?? null;

  const pdvComPlayerAtivo = Boolean(instaladoEm || lastPingAt);

  if (pdvComPlayerAtivo) {
    const desde =
      instaladoEm instanceof Date
        ? instaladoEm.toLocaleString("pt-BR")
        : typeof instaladoEm === "string" && instaladoEm.trim()
          ? new Date(instaladoEm).toLocaleString("pt-BR")
          : null;
    return {
      podeGerarLink: false,
      errorCode: "pdv_com_player_instalado",
      motivo:
        desde
          ? `PDV com player instalado desde ${desde}${lastPingAt ? " e ping ativo" : ""}. Regerar a chave serial antes de novo link/código.`
          : "PDV com player em operação (ping registrado). Regerar a chave serial antes de novo link/código.",
      programacaoAlert,
      pdvComPlayerAtivo: true,
    };
  }

  return {
    podeGerarLink: true,
    errorCode: null,
    motivo: null,
    programacaoAlert,
    pdvComPlayerAtivo: false,
  };
}

/** Alerta de programação (amarelo/vermelho informativo; vermelho também bloqueia via `loadInstalacaoGeracaoGate`). */
export async function loadInstalacaoProgramacaoAlert(
  rioPdvKey: string,
): Promise<InstalacaoProgramacaoAlert> {
  const ctx = await loadMergedProducaoPlayerContext();
  let clienteKey: string | null = null;
  for (const bucket of ctx.buckets) {
    if (bucket.pdvs.some((p) => p.rioPdvId === rioPdvKey)) {
      clienteKey = bucket.key;
      break;
    }
  }

  const cadastro = await prisma.producaoPdvCadastro.findUnique({
    where: { rioPdvKey },
    select: {
      programacaoId: true,
      programacaoMusical: true,
      programacao: {
        select: {
          id: true,
          nome: true,
          clienteRef: true,
          publicada: true,
          atualizacaoAbertaEm: true,
        },
      },
    },
  });

  const programacoesDoCliente =
    clienteKey ?
      await prisma.programacao.findMany({
        where: { clienteRef: clienteKey },
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
      })
    : [];

  const { programacaoId, programacaoNome } = resolvePdvProgramacaoAssignment(
    cadastro,
    clienteKey ?? "",
    programacoesDoCliente,
  );

  if (!programacaoId) {
    return {
      nivel: "vermelho",
      titulo: "Sem programação amarrada",
      mensagem: "Este PDV não tem programação vinculada na produção.",
      programacaoNome: null,
      programacaoAmarrada: false,
      programacaoFechada: null,
    };
  }

  const hasAberta = await hasAtualizacaoAbertaColumn();
  const progFromCadastro =
    cadastro?.programacao?.id === programacaoId ? cadastro.programacao : null;
  const prog =
    progFromCadastro ??
    (await prisma.programacao.findUnique({
      where: { id: programacaoId },
      select: {
        id: true,
        nome: true,
        publicada: true,
        ...(hasAberta ? { atualizacaoAbertaEm: true } : {}),
      },
    }));

  const nome = programacaoNome ?? prog?.nome ?? null;
  const aberta = hasAberta && prog && "atualizacaoAbertaEm" in prog && prog.atualizacaoAbertaEm;
  const fechada = !aberta;

  if (aberta) {
    return {
      nivel: "amarelo",
      titulo: "Programação aberta (não fechada)",
      mensagem:
        nome ?
          `A programação «${nome}» está com atualização aberta na produção.`
        : "A programação vinculada está com atualização aberta na produção.",
      programacaoNome: nome,
      programacaoAmarrada: true,
      programacaoFechada: false,
    };
  }

  if (!prog?.publicada) {
    return {
      nivel: "amarelo",
      titulo: "Programação não publicada",
      mensagem:
        nome ?
          `A programação «${nome}» está amarrada, mas ainda não foi publicada/disparada.`
        : "A programação vinculada ainda não foi publicada/disparada.",
      programacaoNome: nome,
      programacaoAmarrada: true,
      programacaoFechada: fechada,
    };
  }

  return {
    nivel: "ok",
    titulo: "Programação OK",
    mensagem:
      nome ?
        `Programação «${nome}» amarrada e fechada.`
      : "Programação amarrada e fechada.",
    programacaoNome: nome,
    programacaoAmarrada: true,
    programacaoFechada: true,
  };
}

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
