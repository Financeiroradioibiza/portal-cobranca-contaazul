import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const MAX_MSG = 2000;

/** Aviso vermelho no Player 5 após fechar/publicar — lido via POST /api/player-avisos no cloud2. */
export async function pushPlayerAvisoAtualizacao(opts: {
  portalClienteId: number;
  portalPdvIds: number[];
  rotulo: string;
  programacaoNome?: string;
}): Promise<void> {
  const ids = [...new Set(opts.portalPdvIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return;

  const rotulo = opts.rotulo.trim() || "ATL";
  const prog = opts.programacaoNome?.trim();
  const msg = (
    prog ?
      `${rotulo} — ${prog}. Aguarde o download da programação.`
    : `${rotulo} — aguarde o download da programação.`
  ).slice(0, MAX_MSG);

  const batchId = crypto.randomUUID();
  await prisma.playerAvisoOperador.createMany({
    data: ids.map((portalPdvId) => ({
      portalClienteId: opts.portalClienteId,
      portalPdvId,
      mensagem: msg,
      batchId,
    })),
  });
}
