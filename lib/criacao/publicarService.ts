import { prisma } from "@/lib/prisma";
import { cloud2Enabled, cloud2Fetch } from "@/lib/criacao/cloud2Client";

export type GatewayCliente = { id: number; nome: string; pdvs: number };

export async function listGatewayClientes(): Promise<GatewayCliente[]> {
  if (!cloud2Enabled()) return [];
  const res = await cloud2Fetch("/gateway-clientes");
  if (!res.ok) throw new Error("gateway_clientes_falhou");
  const data = (await res.json()) as { ok?: boolean; clientes?: GatewayCliente[] };
  return data.clientes ?? [];
}

export type PublicarResultado = {
  ok: boolean;
  playlists: number;
  musicas: number;
  semArquivo: number;
  clienteGatewayId: number;
  clienteGatewayNome: string;
};

/**
 * Publica a programação no gateway do Player 5 (cloud2) e marca como publicada no Neon.
 * O áudio continua sendo servido direto pelo cloud2 — nada passa pelo Netlify.
 */
export async function publicarProgramacao(
  programacaoId: string,
  clienteIdGateway: number,
): Promise<PublicarResultado> {
  if (!cloud2Enabled()) throw new Error("cloud2_desabilitado");

  const prog = await prisma.programacao.findUnique({
    where: { id: programacaoId },
    select: { id: true, nome: true, clienteNome: true },
  });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const res = await cloud2Fetch("/publicar", {
    method: "POST",
    body: JSON.stringify({ programacaoId, clienteIdGateway }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    playlists?: number;
    musicas?: number;
    semArquivo?: number;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "publicar_falhou");
  }

  await prisma.programacao.update({
    where: { id: programacaoId },
    data: { publicada: true, publishedAt: new Date() },
  });

  const gw = await listGatewayClientes().catch(() => [] as GatewayCliente[]);
  const cli = gw.find((c) => c.id === clienteIdGateway);

  return {
    ok: true,
    playlists: data.playlists ?? 0,
    musicas: data.musicas ?? 0,
    semArquivo: data.semArquivo ?? 0,
    clienteGatewayId: clienteIdGateway,
    clienteGatewayNome: cli?.nome ?? String(clienteIdGateway),
  };
}

/** Sugere o cliente do gateway cujo nome mais se aproxima do cliente da produção. */
export function sugerirGatewayCliente(
  clienteNome: string,
  clientes: GatewayCliente[],
): GatewayCliente | null {
  const alvo = clienteNome.trim().toLowerCase();
  if (!alvo || clientes.length === 0) return null;
  const exato = clientes.find((c) => c.nome.trim().toLowerCase() === alvo);
  if (exato) return exato;
  const contem = clientes.find(
    (c) => c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase()),
  );
  return contem ?? null;
}
