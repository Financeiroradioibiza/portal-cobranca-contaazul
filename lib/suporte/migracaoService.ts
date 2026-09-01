import { prisma } from "@/lib/prisma";
import { listCriativosForTag } from "@/lib/criacao/criativoUserService";
import { resolvePdvProgramacaoAssignment } from "@/lib/criacao/pdvProgramacaoService";
import { hasAtualizacaoAbertaColumn } from "@/lib/criacao/programacaoSchemaCompat";
import {
  loadMergedProducaoPlayerContext,
  pdvElegivelParaDisparo,
  resolvePortalPdvIdForPdv,
  type ProducaoPlayerBucket,
} from "@/lib/player/producaoPlayerBuckets";
import { loadPlayerGatewayTelemetry } from "@/lib/player/loadPlayerGatewayTelemetry";

export type MigracaoProgramacaoStatus = "AUSENTE" | "CRIADA" | "PRONTA";

export type MigracaoClienteRow = {
  clienteRef: string;
  clienteNome: string;
  portalClienteId: number | null;
  programacaoId: string | null;
  donoEmail: string | null;
  donoNome: string | null;
  donoIniciais: string | null;
  donoCor: string | null;
  pdvsAmarrados: boolean;
  temProgramacao: boolean;
  statusProgramacao: MigracaoProgramacaoStatus;
  programacaoNome: string | null;
  algumPdvInstalado: boolean;
  faltaPdvInstalar: boolean;
  totalPdvsInstalaveis: number;
  pdvsComPing: number;
  pdvsSemPing: number;
  /** Maior lastPingAt entre PDVs do cliente — ordenação (instalação mais recente primeiro). */
  ultimoPingEm: string | null;
};

type ProgramacaoRow = {
  id: string;
  clienteRef: string;
  clienteNome: string;
  nome: string;
  publicada: boolean;
  atualizacaoAbertaEm: Date | null;
  updatedAt: Date;
  criativoUserId: string | null;
  criativoNome: string;
};

type CriativoTagLookup = {
  displayName: string;
  tagIniciais: string;
  tagCor: string;
};

function resolveDonoFromProgramacao(
  prog: ProgramacaoRow | null | undefined,
  criativoByEmail: Map<string, CriativoTagLookup>,
): Pick<MigracaoClienteRow, "programacaoId" | "donoEmail" | "donoNome" | "donoIniciais" | "donoCor"> {
  if (!prog) {
    return {
      programacaoId: null,
      donoEmail: null,
      donoNome: null,
      donoIniciais: null,
      donoCor: null,
    };
  }

  const email = prog.criativoUserId?.trim() || null;
  const criativo = email ? criativoByEmail.get(email) : undefined;
  const nomeDb = prog.criativoNome.trim();

  if (criativo) {
    return {
      programacaoId: prog.id,
      donoEmail: email,
      donoNome: criativo.displayName,
      donoIniciais: criativo.tagIniciais,
      donoCor: criativo.tagCor,
    };
  }

  if (email) {
    return {
      programacaoId: prog.id,
      donoEmail: email,
      donoNome: nomeDb || email,
      donoIniciais: null,
      donoCor: "#6366f1",
    };
  }

  if (nomeDb) {
    return {
      programacaoId: prog.id,
      donoEmail: null,
      donoNome: nomeDb,
      donoIniciais: null,
      donoCor: "#94a3b8",
    };
  }

  return {
    programacaoId: prog.id,
    donoEmail: null,
    donoNome: null,
    donoIniciais: null,
    donoCor: null,
  };
}

function resolveProgramacaoStatus(prog: ProgramacaoRow | null | undefined): MigracaoProgramacaoStatus {
  if (!prog) return "AUSENTE";
  if (prog.atualizacaoAbertaEm) return "CRIADA";
  if (!prog.publicada) return "CRIADA";
  return "PRONTA";
}

function worstProgramacaoStatus(statuses: MigracaoProgramacaoStatus[]): MigracaoProgramacaoStatus {
  if (statuses.length === 0) return "AUSENTE";
  if (statuses.includes("AUSENTE")) return "AUSENTE";
  if (statuses.includes("CRIADA")) return "CRIADA";
  return "PRONTA";
}

function findBucketForRef(
  buckets: ProducaoPlayerBucket[],
  clienteRef: string,
): ProducaoPlayerBucket | null {
  const ref = clienteRef.trim();
  return (
    buckets.find((b) => b.key === ref) ??
    buckets.find((b) => b.rioLinhaId === ref) ??
    null
  );
}

/** Painel Suporte → Migração: clientes com programação criada e checklist de instalação. */
export async function listMigracaoClientes(): Promise<{
  ok: boolean;
  rows: MigracaoClienteRow[];
  cloud2Ok: boolean;
  error?: string;
}> {
  const hasAberta = await hasAtualizacaoAbertaColumn();

  const [programacoes, criativos] = await Promise.all([
    prisma.programacao.findMany({
      select: {
        id: true,
        clienteRef: true,
        clienteNome: true,
        nome: true,
        publicada: true,
        updatedAt: true,
        criativoUserId: true,
        criativoNome: true,
        ...(hasAberta ? { atualizacaoAbertaEm: true } : {}),
      },
      orderBy: [{ clienteRef: "asc" }, { updatedAt: "desc" }],
    }),
    listCriativosForTag(),
  ]);

  const criativoByEmail = new Map(
    criativos.map((c) => [
      c.email,
      { displayName: c.displayName, tagIniciais: c.tagIniciais, tagCor: c.tagCor },
    ]),
  );

  if (programacoes.length === 0) {
    return { ok: true, rows: [], cloud2Ok: false };
  }

  const programacoesByCliente = new Map<string, ProgramacaoRow[]>();
  const clienteNomes = new Map<string, string>();

  for (const raw of programacoes) {
    const ref = raw.clienteRef.trim();
    if (!ref) continue;
    const row: ProgramacaoRow = {
      id: raw.id,
      clienteRef: ref,
      clienteNome: raw.clienteNome.trim(),
      nome: raw.nome.trim(),
      publicada: raw.publicada,
      atualizacaoAbertaEm:
        hasAberta && "atualizacaoAbertaEm" in raw && raw.atualizacaoAbertaEm ?
          raw.atualizacaoAbertaEm
        : null,
      updatedAt: raw.updatedAt,
      criativoUserId: raw.criativoUserId ?? null,
      criativoNome: raw.criativoNome.trim(),
    };
    const list = programacoesByCliente.get(ref) ?? [];
    list.push(row);
    programacoesByCliente.set(ref, list);
    if (row.clienteNome) clienteNomes.set(ref, row.clienteNome);
  }

  const clienteRefs = [...programacoesByCliente.keys()];
  const ctx = await loadMergedProducaoPlayerContext();

  for (const bucket of ctx.buckets) {
    if (!clienteNomes.has(bucket.key) && bucket.nome.trim()) {
      clienteNomes.set(bucket.key, bucket.nome.trim());
    }
  }

  const allRioKeys = new Set<string>();
  for (const ref of clienteRefs) {
    const bucket = findBucketForRef(ctx.buckets, ref);
    if (!bucket) continue;
    for (const pdv of bucket.pdvs) {
      if (pdvElegivelParaDisparo(pdv, bucket, ctx.pdvPortalIds)) {
        allRioKeys.add(pdv.rioPdvId);
      }
    }
  }

  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: [...allRioKeys] } },
    select: {
      rioPdvKey: true,
      programacaoId: true,
      programacaoMusical: true,
      programacao: { select: { id: true, nome: true, clienteRef: true } },
    },
  });
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const portalPdvIds: number[] = [];
  const pdvMetaByPortalId = new Map<
    number,
    { clienteRef: string; rioPdvKey: string; programacaoId: string | null }
  >();

  for (const ref of clienteRefs) {
    const bucket = findBucketForRef(ctx.buckets, ref);
    if (!bucket) continue;
    const progs = programacoesByCliente.get(ref) ?? [];
    for (const pdv of bucket.pdvs) {
      if (!pdvElegivelParaDisparo(pdv, bucket, ctx.pdvPortalIds)) continue;
      const portalPdvId =
        pdv.isLinhaProxy && bucket.portalClienteId != null
          ? resolvePortalPdvIdForPdv(pdv, bucket, ctx.pdvPortalIds)
          : (ctx.pdvPortalIds.get(pdv.rioPdvId) ?? null);
      if (portalPdvId == null) continue;
      const cad = cadastroByKey.get(pdv.rioPdvId);
      const { programacaoId } = resolvePdvProgramacaoAssignment(cad, bucket.key, progs);
      portalPdvIds.push(portalPdvId);
      pdvMetaByPortalId.set(portalPdvId, {
        clienteRef: ref,
        rioPdvKey: pdv.rioPdvId,
        programacaoId,
      });
    }
  }

  const gateway = await loadPlayerGatewayTelemetry([...new Set(portalPdvIds)]);

  const rows: MigracaoClienteRow[] = [];

  for (const clienteRef of clienteRefs) {
    const progs = programacoesByCliente.get(clienteRef) ?? [];
    const bucket = findBucketForRef(ctx.buckets, clienteRef);
    const clienteNome =
      bucket?.nome.trim() ||
      clienteNomes.get(clienteRef) ||
      progs[0]?.clienteNome ||
      clienteRef;

    const progById = new Map(progs.map((p) => [p.id, p]));

    let totalInstalaveis = 0;
    let amarrados = 0;
    let comPing = 0;
    let ultimoPingMs = 0;

    if (bucket) {
      for (const pdv of bucket.pdvs) {
        if (!pdvElegivelParaDisparo(pdv, bucket, ctx.pdvPortalIds)) continue;
        const portalPdvId =
          pdv.isLinhaProxy && bucket.portalClienteId != null
            ? resolvePortalPdvIdForPdv(pdv, bucket, ctx.pdvPortalIds)
            : (ctx.pdvPortalIds.get(pdv.rioPdvId) ?? null);
        if (portalPdvId == null) continue;

        totalInstalaveis += 1;
        const cad = cadastroByKey.get(pdv.rioPdvId);
        const { programacaoId } = resolvePdvProgramacaoAssignment(cad, bucket.key, progs);
        if (programacaoId) amarrados += 1;

        const tel = gateway.byPdvId.get(portalPdvId);
        const pingAt = tel?.firstPingAt ?? tel?.lastPingAt ?? null;
        if (pingAt) {
          comPing += 1;
          const ms = Date.parse(pingAt);
          if (Number.isFinite(ms) && ms > ultimoPingMs) ultimoPingMs = ms;
        }
        const lastMs = tel?.lastPingAt ? Date.parse(tel.lastPingAt) : 0;
        if (Number.isFinite(lastMs) && lastMs > ultimoPingMs) ultimoPingMs = lastMs;
      }
    }

    const pdvsAmarrados =
      totalInstalaveis === 0 ? false : amarrados === totalInstalaveis;

    const statusIds = new Set<string>();
    if (bucket) {
      for (const pdv of bucket.pdvs) {
        if (!pdvElegivelParaDisparo(pdv, bucket, ctx.pdvPortalIds)) continue;
        const portalPdvId =
          pdv.isLinhaProxy && bucket.portalClienteId != null
            ? resolvePortalPdvIdForPdv(pdv, bucket, ctx.pdvPortalIds)
            : (ctx.pdvPortalIds.get(pdv.rioPdvId) ?? null);
        if (portalPdvId == null) continue;
        const meta = pdvMetaByPortalId.get(portalPdvId);
        if (meta?.programacaoId) statusIds.add(meta.programacaoId);
      }
    }

    const statusSources =
      statusIds.size > 0
        ? [...statusIds].map((id) => progById.get(id)).filter(Boolean)
        : progs;

    const statusProgramacao = worstProgramacaoStatus(
      statusSources.map((p) => resolveProgramacaoStatus(p)),
    );

    const primaryProg =
      statusSources.sort((a, b) => b!.updatedAt.getTime() - a!.updatedAt.getTime())[0] ??
      progs[0] ??
      null;

    const semPing = totalInstalaveis - comPing;
    const dono = resolveDonoFromProgramacao(primaryProg, criativoByEmail);

    rows.push({
      clienteRef,
      clienteNome,
      portalClienteId: bucket?.portalClienteId ?? null,
      ...dono,
      pdvsAmarrados,
      temProgramacao: progs.length > 0,
      statusProgramacao,
      programacaoNome: primaryProg?.nome ?? null,
      algumPdvInstalado: comPing > 0,
      faltaPdvInstalar: semPing > 0,
      totalPdvsInstalaveis: totalInstalaveis,
      pdvsComPing: comPing,
      pdvsSemPing: semPing,
      ultimoPingEm: ultimoPingMs > 0 ? new Date(ultimoPingMs).toISOString() : null,
    });
  }

  rows.sort((a, b) => {
    const ta = a.ultimoPingEm ? Date.parse(a.ultimoPingEm) : 0;
    const tb = b.ultimoPingEm ? Date.parse(b.ultimoPingEm) : 0;
    if (tb !== ta) return tb - ta;
    return a.clienteNome.localeCompare(b.clienteNome, "pt-BR", { sensitivity: "base" });
  });

  return { ok: true, rows, cloud2Ok: gateway.ok };
}
