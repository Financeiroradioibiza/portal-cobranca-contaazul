/** Persiste dono criativo da programação no banco (além do localStorage). */

export async function persistProgramacaoDonoToServer(
  programacaoId: string,
  criativo: { email: string; displayName: string } | null,
): Promise<boolean> {
  const res = await fetch(`/api/criacao/programacoes/${encodeURIComponent(programacaoId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      criativo ?
        {
          criativoUserId: criativo.email,
          criativoNome: criativo.displayName,
        }
      : {
          criativoUserId: null,
          criativoNome: "",
        },
    ),
  });
  return res.ok;
}
