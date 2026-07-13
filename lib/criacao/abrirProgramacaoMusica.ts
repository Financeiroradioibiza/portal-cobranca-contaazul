import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";
import { prisma } from "@/lib/prisma";

/** Mantém programação aberta na central após qualquer alteração (produção fecha manualmente). */
export async function abrirProgramacaoAposMusica(
  programacaoId: string | null | undefined,
  por: string,
): Promise<void> {
  const id = (programacaoId ?? "").trim();
  if (!id) return;
  try {
    await abrirAtualizacao(id, por.slice(0, 200));
  } catch {
    /* migration pendente ou programação inexistente */
  }
}

export async function abrirProgramacaoPorPastaId(pastaId: string, por: string): Promise<void> {
  const pasta = await prisma.pasta.findUnique({
    where: { id: pastaId },
    select: { programacaoId: true },
  });
  await abrirProgramacaoAposMusica(pasta?.programacaoId, por);
}
