import { abrirAtualizacao } from "@/lib/criacao/atualizacaoService";

/** Mantém programação aberta na central após qualquer inclusão de faixa (produção fecha manualmente). */
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
