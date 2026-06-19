import { cloud2Fetch } from "@/lib/criacao/cloud2Client";
import { mapPdvCadastroToGatewayFields } from "@/lib/player/pdvGatewayFields";
import { formatPortalPdvIdDisplay, proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import {
  loadMergedProducaoPlayerContext,
  loadProgramacaoMusicalMaps,
  resolveProgramacaoMusicalForBucket,
} from "@/lib/player/producaoPlayerBuckets";
import { prisma } from "@/lib/prisma";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";

export type PlayerGatewaySyncPayload = {
  clientes: Array<{
    id: number;
    nome: string;
    email: string | null;
    senhaHash: string | null;
    origemRioLinhaId: string;
    logotipoBase64?: string | null;
  }>;
  pdvs: Array<{
    id: number;
    clienteId: number;
    nome: string;
    codigoDisplay: string;
    origemRioPdvId: string | null;
    origemRioLinhaId: string;
    instalacaoToken: string | null;
    programacaoMusical: string;
    status: "A" | "I";
    ctrlPlayer: "S" | "N";
    ctrlPlacaCarro: "S" | "N";
    ctrlPlaylists: "S" | "N";
    cidade: string;
    uf: string;
    nomeCompletoContatoExtra: string;
  }>;
};

export async function buildPlayerGatewaySyncPayload(): Promise<PlayerGatewaySyncPayload> {
  const [ctx, logins, logos, progMaps] = await Promise.all([
    loadMergedProducaoPlayerContext(),
    prisma.clientePlayerLogin.findMany({
      where: { active: true },
      select: { portalClienteId: true, email: true, passwordHash: true },
    }),
    prisma.playerClienteLogotipo.findMany({
      select: { portalClienteId: true, jpegBase64: true },
    }),
    loadProgramacaoMusicalMaps(),
  ]);

  const loginByClienteId = new Map(logins.map((l) => [l.portalClienteId, l]));
  const logoByClienteId = new Map(logos.map((l) => [l.portalClienteId, l.jpegBase64]));

  const rioKeys = ctx.buckets.flatMap((b) => b.pdvs.map((p) => p.rioPdvId));
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: rioKeys } },
    select: {
      rioPdvKey: true,
      playerInstalacaoToken: true,
      controlarPlayer: true,
      placaCarro: true,
      controlarPlaylist: true,
      statusPlayer: true,
      cidade: true,
      estado: true,
      playerContatoExtraCodigo: true,
    },
  });
  const cadastroByKey = new Map(cadastros.map((c) => [c.rioPdvKey, c]));

  const clientes: PlayerGatewaySyncPayload["clientes"] = [];
  const pdvs: PlayerGatewaySyncPayload["pdvs"] = [];

  for (const bucket of ctx.buckets) {
    if (bucket.portalClienteId == null) continue;

    const portalClienteId = bucket.portalClienteId;
    const nome = bucket.nome.trim() || "Cliente";
    const login = loginByClienteId.get(portalClienteId);
    const origemRioLinhaId = bucket.rioLinhaId || bucket.pdvs[0]?.rioLinhaId || bucket.key;

    clientes.push({
      id: portalClienteId,
      nome,
      email: login?.email ?? null,
      senhaHash: login?.passwordHash ?? null,
      origemRioLinhaId,
      logotipoBase64: logoByClienteId.get(portalClienteId) ?? "",
    });

    const programacaoMusical = resolveProgramacaoMusicalForBucket(bucket, progMaps);
    const sorted = sortRioPdvsByNome(bucket.pdvs.map((p) => ({ id: p.rioPdvId, nome: p.nome })));
    const pdvList = sorted.map((s) => bucket.pdvs.find((p) => p.rioPdvId === s.id)!);

    for (const p of pdvList) {
      const cad = cadastroByKey.get(p.rioPdvId);
      const gw = mapPdvCadastroToGatewayFields(cad);

      if (p.isLinhaProxy) {
        const virtualId = proxyPortalPdvId(portalClienteId);
        pdvs.push({
          id: virtualId,
          clienteId: portalClienteId,
          nome: p.nome.trim() || nome,
          codigoDisplay: formatPortalPdvIdDisplay(virtualId),
          origemRioPdvId: null,
          origemRioLinhaId: p.rioLinhaId,
          instalacaoToken: cad?.playerInstalacaoToken?.trim() || null,
          programacaoMusical,
          ...gw,
        });
        continue;
      }

      const portalPdvId = ctx.pdvPortalIds.get(p.rioPdvId);
      if (portalPdvId == null) continue;

      pdvs.push({
        id: portalPdvId,
        clienteId: portalClienteId,
        nome: p.nome.trim() || nome,
        codigoDisplay: formatPortalPdvIdDisplay(portalPdvId),
        origemRioPdvId: p.rioPdvId,
        origemRioLinhaId: p.rioLinhaId,
        instalacaoToken: cad?.playerInstalacaoToken?.trim() || null,
        programacaoMusical,
        ...gw,
      });
    }
  }

  return { clientes, pdvs };
}

export async function syncPlayerGatewayRegistry(): Promise<{
  clientes: number;
  pdvs: number;
}> {
  const payload = await buildPlayerGatewaySyncPayload();
  const res = await cloud2Fetch("/player/sync-registry", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    clientes?: number;
    pdvs?: number;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "sync_registry_falhou");
  }
  return { clientes: data.clientes ?? payload.clientes.length, pdvs: data.pdvs ?? payload.pdvs.length };
}
