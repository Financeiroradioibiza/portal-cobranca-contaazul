import { cloud2Fetch, cloud2FetchWithTimeout, parseCloud2Json } from "@/lib/criacao/cloud2Client";
import { mapPdvCadastroToGatewayFields } from "@/lib/player/pdvGatewayFields";
import { formatPortalPdvIdDisplay, proxyPortalPdvId } from "@/lib/player/portalPlayerIds";
import {
  loadMergedProducaoPlayerContext,
} from "@/lib/player/producaoPlayerBuckets";
import { prisma } from "@/lib/prisma";
import { sortRioPdvsByNome } from "@/lib/rio/pdvNames";
import { ensureInstalacaoTokensForKeys } from "@/lib/player/pdvInstalacaoToken";

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
    /** N = aparece no Player 5 para instalar; S = já instalado. */
    instaladoPlayer: "N" | "S";
    /** Nome legado no gateway (programas.nome). */
    programacaoMusical: string;
    /** ID da programação no Neon — resolve programas.origem_programacao_id no sync. */
    programacaoPortalId: string | null;
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
  const [ctx, logins, logos] = await Promise.all([
    loadMergedProducaoPlayerContext(),
    prisma.clientePlayerLogin.findMany({
      where: { active: true },
      select: { portalClienteId: true, email: true, passwordHash: true },
    }),
    prisma.playerClienteLogotipo.findMany({
      select: { portalClienteId: true, jpegBase64: true },
    }),
  ]);

  const loginByClienteId = new Map(logins.map((l) => [l.portalClienteId, l]));
  const logoByClienteId = new Map(logos.map((l) => [l.portalClienteId, l.jpegBase64]));

  /** Logos grandes no bulk sync estouram timeout/nginx — sincronizam no upload dedicado. */
  function logoForSync(portalClienteId: number): string | null {
    const b64 = logoByClienteId.get(portalClienteId)?.trim() ?? "";
    if (!b64 || b64.length > 180_000) return null;
    return b64;
  }

  const rioKeys = ctx.buckets.flatMap((b) => b.pdvs.map((p) => p.rioPdvId));
  const cadastros = await prisma.producaoPdvCadastro.findMany({
    where: { rioPdvKey: { in: rioKeys } },
    select: {
      rioPdvKey: true,
      playerInstalacaoToken: true,
      playerInstaladoEm: true,
      controlarPlayer: true,
      placaCarro: true,
      controlarPlaylist: true,
      statusPlayer: true,
      cidade: true,
      estado: true,
      playerContatoExtraCodigo: true,
      programacaoMusical: true,
      programacaoId: true,
      programacao: { select: { nome: true, clienteRef: true } },
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
      logotipoBase64: logoForSync(portalClienteId),
    });

    const sorted = sortRioPdvsByNome(bucket.pdvs.map((p) => ({ id: p.rioPdvId, nome: p.nome })));
    const pdvList = sorted.map((s) => bucket.pdvs.find((p) => p.rioPdvId === s.id)!);

    function programacaoForPdv(rioPdvKey: string): { nome: string; portalId: string | null } {
      const cad = cadastroByKey.get(rioPdvKey);
      if (cad?.programacaoId) {
        const nome = cad.programacao?.nome?.trim() || cad.programacaoMusical?.trim() || "";
        return { nome, portalId: cad.programacaoId };
      }
      const leg = cad?.programacaoMusical?.trim();
      if (leg) return { nome: leg, portalId: null };
      return { nome: "", portalId: null };
    }

    function instaladoPlayerFor(rioPdvKey: string): "N" | "S" {
      const cad = cadastroByKey.get(rioPdvKey);
      return cad?.playerInstaladoEm ? "S" : "N";
    }

    function rioKeyForToken(p: { rioPdvId: string; rioLinhaId: string; isLinhaProxy?: boolean }): string {
      if (p.isLinhaProxy && p.rioLinhaId) return `linha:${p.rioLinhaId}`;
      return p.rioPdvId;
    }

    for (const p of pdvList) {
      const cad = cadastroByKey.get(p.rioPdvId);
      const gw = mapPdvCadastroToGatewayFields(cad);
      const prog = programacaoForPdv(p.rioPdvId);

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
          instaladoPlayer: instaladoPlayerFor(rioKeyForToken(p)),
          programacaoMusical: prog.nome,
          programacaoPortalId: prog.portalId,
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
        instaladoPlayer: instaladoPlayerFor(rioKeyForToken(p)),
        programacaoMusical: prog.nome,
        programacaoPortalId: prog.portalId,
        ...gw,
      });
    }
  }

  return { clientes, pdvs };
}

function rioKeyForSyncPdv(p: PlayerGatewaySyncPayload["pdvs"][number]): string | null {
  return p.origemRioPdvId ?? (p.origemRioLinhaId ? `linha:${p.origemRioLinhaId}` : null);
}

async function hydrateInstalacaoTokens(
  payload: PlayerGatewaySyncPayload,
): Promise<PlayerGatewaySyncPayload> {
  const missingKeys = payload.pdvs
    .filter((p) => !p.instalacaoToken?.trim())
    .map((p) => rioKeyForSyncPdv(p))
    .filter((k): k is string => Boolean(k));

  const tokensByKey = await ensureInstalacaoTokensForKeys(missingKeys);

  const pdvs = payload.pdvs.map((p) => {
    if (p.instalacaoToken?.trim()) return p;
    const rioKey = rioKeyForSyncPdv(p);
    const token = rioKey ? tokensByKey.get(rioKey) : undefined;
    return token ? { ...p, instalacaoToken: token } : p;
  });

  return { ...payload, pdvs };
}

export async function syncPlayerGatewayRegistry(): Promise<{
  clientes: number;
  pdvs: number;
}> {
  const raw = await buildPlayerGatewaySyncPayload();
  const payload = await hydrateInstalacaoTokens(raw);
  const res = await cloud2FetchWithTimeout(
    "/player/sync-registry",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    90_000,
  );
  const data = await parseCloud2Json<{
    ok?: boolean;
    error?: string;
    clientes?: number;
    pdvs?: number;
  }>(res, "sync_registry");
  if (!res?.ok || !data.ok) {
    throw new Error(data.error ?? "sync_registry_falhou");
  }
  return { clientes: data.clientes ?? payload.clientes.length, pdvs: data.pdvs ?? payload.pdvs.length };
}
