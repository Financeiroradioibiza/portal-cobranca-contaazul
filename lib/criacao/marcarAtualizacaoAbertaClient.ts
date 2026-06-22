/** Marca programação com atualização aberta (laranja) após a primeira edição de conteúdo. */
export async function marcarAtualizacaoAberta(programacaoId: string): Promise<boolean> {
  const res = await fetch(`/api/criacao/programacoes/${programacaoId}/abrir-atualizacao`, {
    method: "POST",
  });
  if (res.ok) return true;
  if (res.status === 503) return false;
  return false;
}
