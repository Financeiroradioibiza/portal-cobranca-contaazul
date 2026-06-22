import { prisma } from "@/lib/prisma";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { formatPortalPdvIdDisplay, proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import { loadMergedProducaoPlayerContext } from "@/lib/player/producaoPlayerBuckets";
import { syncPlayerGatewayRegistry } from "@/lib/player/playerGatewaySync";

export type PdvProgramacaoRow = {
  rioPdvKey: string;
  nome: string;
  portalPdvId: number | null;
  codigoDisplay: string;
  programacaoId: string | null;
  programacaoNome: string | null;
  isLinhaProxy: boolean;
};

export type ClientePdvProgramacaoPayload = {
  clienteRef: string;
  clienteNome: string;
  portalClienteId: number | null;
  pdvs: PdvProgramacaoRow[];
  programacoes: Array<{ id: string; nome: string }>;
};

type CadastroProgramacaoFields = {
  programacaoId: string | null;
  programacaoMusical: string;
  programacao: { id: string; nome: string; clienteRef: string } | null;
} | null
  | undefined;

/** Resolve amarração PDV → programação (Central de programações / criação). */
export function resolvePdvProgramacaoAssignment(
  cad: CadastroProgramacaoFields,
  clienteRef: string,
  programacoesDoCliente: Array<{ id: string; nome: string }>,
): { programacaoId: string | null; programacaoNome: string | null } {
  let programacaoId = cad?.programacaoId ?? null;
  let programacaoNome = cad?.programacao?.nome ?? null;

  if (programacaoId && cad?.programacao?.clienteRef !== clienteRef) {
    programacaoId = null;
    programacaoNome = null;
  }

  if (!programacaoId && cad?.programacaoMusical?.trim()) {
    const leg = programacoesDoCliente.find(
      (pr) => pr.nome.trim().toLowerCase() === cad.programacaoMusical.trim().toLowerCase(),
    );
    if (leg) {
      programacaoId = leg.id;
      programacaoNome = leg.nome;
    }
  }

  return { programacaoId, programacaoNome };
}

async function findBucketForClienteRef(clienteRef: string) {
  const ctx = await loadMergedProducaoPlayerContext();
  const ref = clienteRef.trim();
  const bucket =
    ctx.buckets.find((b) => b.key === ref) ??
    ctx.buckets.find((b) => b.rioLinhaId === ref) ??
    null;
  return { ctx, bucket };
}

export async function resolveGatewayClienteIdForClienteRef(clienteRef: string): Promise<number | null> {
  const { bucket } = await findBucketForClienteRef(clienteRef);
  return bucket?.portalClienteId ?? null;
}

export async function getClientePdvProgramacoes(clienteRef: string): Promise<ClientePdvProgramacaoPayload> {
  const { ctx, bucket } = await findBucketForClienteRef(clienteRef);
  if (!bucket) {
    return {
      clienteRef,
      clienteNome: "",
      portalClienteId: null,
      pdvs: [],
      programacoes: [],
    };
  }

  const rioKeys = bucket.pdvs.map((p) => p.rioPdvId);
  const [cadastros, programacoes] = await Promise.all([
    prisma.producaoPdvCadastro.findMany({
      where: { rioPdvKey: { in: rioKeys } },
      select: {
        rioPdvKey: true,
        programacaoId: true,
        programacaoMusical: true,
        programacao: { select: { id: true, nome: true, clienteRef: true } },
      },
    }),
    prisma.programacao.findMany({
      where: { clienteRef: bucket.key },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const cadByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));
  const sorted = sortRioPdvsByNome(bucket.pdvs.map((p) => ({ id: p.rioPdvId, nome: p.nome })));

  const pdvs: PdvProgramacaoRow[] = sorted.map((s) => {
    const p = bucket.pdvs.find((x) => x.rioPdvId === s.id)!;
    const cad = cadByKey.get(p.rioPdvId);
    const portalPdvId =
      p.isLinhaProxy && bucket.portalClienteId != null ?
        proxyPortalPdvId(bucket.portalClienteId)
      : (ctx.pdvPortalIds.get(p.rioPdvId) ?? null);

    const { programacaoId, programacaoNome } = resolvePdvProgramacaoAssignment(
      cad,
      bucket.key,
      programacoes,
    );

    return {
      rioPdvKey: p.rioPdvId,
      nome: p.nome.trim() || bucket.nome,
      portalPdvId,
      codigoDisplay: portalPdvId != null ? formatPortalPdvIdDisplay(portalPdvId) : "—",
      programacaoId,
      programacaoNome,
      isLinhaProxy: !!p.isLinhaProxy,
    };
  });

  return {
    clienteRef: bucket.key,
    clienteNome: bucket.nome,
    portalClienteId: bucket.portalClienteId,
    pdvs,
    programacoes,
  };
}

export async function savePdvProgramacaoAssignment(
  clienteRef: string,
  rioPdvKey: string,
  programacaoId: string | null,
): Promise<void> {
  const { bucket } = await findBucketForClienteRef(clienteRef);
  if (!bucket) throw new Error("cliente_nao_encontrado");

  const pdv = bucket.pdvs.find((p) => p.rioPdvId === rioPdvKey);
  if (!pdv) throw new Error("pdv_nao_encontrado");

  let programacaoMusical = "Padrão";
  if (programacaoId) {
    const prog = await prisma.programacao.findUnique({
      where: { id: programacaoId },
      select: { id: true, nome: true, clienteRef: true },
    });
    if (!prog || prog.clienteRef !== bucket.key) throw new Error("programacao_invalida");
    programacaoMusical = prog.nome.trim() || "Padrão";
  }

  await prisma.producaoPdvCadastro.upsert({
    where: { rioPdvKey },
    create: {
      rioPdvKey,
      nome: pdv.nome.trim(),
      programacaoId,
      programacaoMusical,
    },
    update: {
      programacaoId,
      programacaoMusical,
    },
  });
}

export async function getPortalPdvIdsForProgramacao(
  programacaoId: string,
): Promise<{ portalClienteId: number; portalPdvIds: number[] }> {
  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { clienteRef: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const payload = await getClientePdvProgramacoes(prog.clienteRef);
  const portalPdvIds = payload.pdvs
    .filter((p) => p.programacaoId === programacaoId && p.portalPdvId != null)
    .map((p) => p.portalPdvId!);

  if (payload.portalClienteId == null) {
    throw new Error("cliente_gateway_nao_configurado");
  }

  return { portalClienteId: payload.portalClienteId, portalPdvIds };
}

/** Sincroniza registry do Player e retorna IDs de PDV amarrados à programação. */
export async function prepareDisparoProgramacao(programacaoId: string): Promise<{
  portalClienteId: number;
  portalPdvIds: number[];
}> {
  const { portalClienteId, portalPdvIds } = await getPortalPdvIdsForProgramacao(programacaoId);
  if (portalPdvIds.length === 0) throw new Error("nenhum_pdv_amarrado");
  await syncPlayerGatewayRegistry();
  return { portalClienteId, portalPdvIds };
}

export async function syncRegistryAfterPdvAssignment(
  portalClienteId: number,
  portalPdvId: number,
): Promise<void> {
  await syncPlayerGatewayRegistry();
  const { signalPlayerProgramacaoUpdate } = await import("@/lib/player/signalPlayerProgramacaoUpdate");
  await signalPlayerProgramacaoUpdate(portalClienteId, [portalPdvId]);
}
