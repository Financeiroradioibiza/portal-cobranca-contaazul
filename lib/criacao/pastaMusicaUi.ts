/** Data em que a faixa entrou nesta pasta (pt-BR). */
export function formatPastaMusicaAddedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Faixa nova nesta atualização aberta (manual, fila ou ATL CRICA) — até fechar a programação. */
export function isMusicaNovaNaAtualizacao(opts: {
  musicaId: string;
  addedAt: string | null | undefined;
  atualizacaoAberta: boolean;
  atualizacaoAbertaEm: string | null | undefined;
  sessionAddedIds?: ReadonlySet<string>;
}): boolean {
  if (opts.sessionAddedIds?.has(opts.musicaId)) return true;
  if (!opts.atualizacaoAberta || !opts.atualizacaoAbertaEm || !opts.addedAt) return false;
  const abertaMs = new Date(opts.atualizacaoAbertaEm).getTime();
  const addedMs = new Date(opts.addedAt).getTime();
  if (Number.isNaN(abertaMs) || Number.isNaN(addedMs)) return false;
  return addedMs >= abertaMs - 2000;
}
