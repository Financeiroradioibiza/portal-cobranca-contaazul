import { prisma } from "@/lib/prisma";
import { VINHETA_FROM_MUSICA_URL } from "@/lib/criacao/ingestTicket";
import { signVinhetaUpload } from "@/lib/criacao/vinhetaSign";
import { addMusicaToVinhetasClientes } from "@/lib/criacao/vinhetaClienteBibliotecaService";

export async function criarVinhetaProgramacaoFromMusicaCliente(args: {
  programacaoId: string;
  musicaId: string;
  nome?: string;
}): Promise<{ id: string; nome: string }> {
  const musicaId = args.musicaId.trim();
  const programacaoId = args.programacaoId.trim();
  if (!musicaId || !programacaoId) throw new Error("parametros_invalidos");

  const link = await prisma.bibliotecaVinhetaCliente.findUnique({ where: { musicaId } });
  if (!link) throw new Error("musica_nao_vinheta_cliente");

  const musica = await prisma.musicaBiblioteca.findUnique({
    where: { id: musicaId },
    select: { id: true, titulo: true, artista: true, status: true },
  });
  if (!musica || musica.status !== "pronta") throw new Error("musica_indisponivel");

  const prog = await prisma.programacao.findUnique({ where: { id: programacaoId }, select: { id: true } });
  if (!prog) throw new Error("programacao_nao_encontrada");

  const nome =
    (args.nome ?? "").trim() ||
    musica.titulo.trim() ||
    `${musica.artista}`.trim() ||
    "Vinheta cliente";

  const vinheta = await prisma.vinheta.create({
    data: {
      programacaoId,
      nome: nome.slice(0, 160),
      tipo: "audio",
      status: "rascunho",
    },
    select: { id: true, nome: true },
  });

  const { token } = signVinhetaUpload(vinheta.id);
  const res = await fetch(VINHETA_FROM_MUSICA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, musicaId, targetVinhetaId: vinheta.id }),
  });
  if (!res.ok) {
    await prisma.vinheta.delete({ where: { id: vinheta.id } });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "copia_falhou");
  }

  return vinheta;
}

/** Garante que faixa processada para Vinhetas clientes está indexada (idempotente). */
export async function ensureVinhetaClienteIndex(musicaId: string): Promise<void> {
  await addMusicaToVinhetasClientes(musicaId);
}
