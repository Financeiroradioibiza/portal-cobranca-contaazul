/** Carrega todos os IDs da listagem atual (mesmos filtros), paginando na API (máx. 200/página). */
export async function fetchAllBibliotecaMusicaIds(
  queryBase: string,
  total: number,
  pageSize = 200,
): Promise<string[]> {
  if (total <= 0) return [];
  const pages = Math.ceil(total / pageSize);
  const ids: string[] = [];
  for (let page = 1; page <= pages; page++) {
    const qs = queryBase ? `${queryBase}&` : "";
    const res = await fetch(
      `/api/criacao/biblioteca?${qs}page=${page}&pageSize=${pageSize}`,
    );
    if (!res.ok) throw new Error("load_failed");
    const data = (await res.json()) as { musicas: { id: string }[] };
    ids.push(...data.musicas.map((m) => m.id));
  }
  return ids;
}
