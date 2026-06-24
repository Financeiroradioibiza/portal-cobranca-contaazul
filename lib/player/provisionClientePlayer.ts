import { cloud2Enabled } from "@/lib/criacao/cloud2Client";
import {
  clientePlayerPasswordForCliente,
  createLoginForClienteIfMissing,
} from "@/lib/player/clientePlayerLoginService";
import {
  loadMergedProducaoPlayerContext,
  portalPdvIdsForBucket,
} from "@/lib/player/producaoPlayerBuckets";
import { syncPlayerGatewayRegistryForPdvIds } from "@/lib/player/playerGatewaySync";
import { prisma } from "@/lib/prisma";

export type ProvisionClientePlayerResult = {
  portalClienteId: number;
  clienteNome: string;
  loginStatus: "created" | "exists";
  email: string;
  passwordPlain: string;
  portalPdvIds: number[];
  gateway: { clientes: number; pdvs: number } | null;
};

/** Cria login do cliente (se faltante) e sincroniza só os PDVs dele no Player 5. */
export async function provisionClientePlayerForBucket(
  bucketKey: string,
): Promise<ProvisionClientePlayerResult> {
  const key = bucketKey.trim();
  if (!key) throw new Error("parametros_invalidos");

  const ctx = await loadMergedProducaoPlayerContext();
  const bucket = ctx.buckets.find((b) => b.key === key);
  if (!bucket) throw new Error("cliente_nao_encontrado");

  const portalClienteId = bucket.portalClienteId;
  if (portalClienteId == null) throw new Error("cliente_sem_id_player");

  const portalPdvIds = portalPdvIdsForBucket(bucket, ctx.pdvPortalIds);
  if (portalPdvIds.length === 0) throw new Error("pdv_sem_id_player");

  const clienteNome = bucket.nome.trim() || "Cliente";
  const loginStatus = await createLoginForClienteIfMissing(portalClienteId, clienteNome);

  const login = await prisma.clientePlayerLogin.findUnique({
    where: { portalClienteId },
    select: { email: true, passwordPlain: true, clienteNome: true },
  });
  if (!login) throw new Error("login_falhou");

  const passwordPlain =
    login.passwordPlain?.trim() ||
    clientePlayerPasswordForCliente(login.clienteNome, portalClienteId);

  let gateway: { clientes: number; pdvs: number } | null = null;
  if (cloud2Enabled()) {
    gateway = await syncPlayerGatewayRegistryForPdvIds(portalPdvIds);
  }

  return {
    portalClienteId,
    clienteNome: login.clienteNome,
    loginStatus,
    email: login.email,
    passwordPlain,
    portalPdvIds,
    gateway,
  };
}
