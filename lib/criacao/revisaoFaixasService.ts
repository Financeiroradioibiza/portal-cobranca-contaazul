/** Item descartado na revisão por duplicata confirmada — não exige mix/trim/tags de novo. */
export const REVISAO_ITEM_DESCARTADA_PREFIX = "Descartada (duplicata confirmada)";

export type RevisaoItemRef = {
  status: string;
  musicaId: string | null;
  erroMsg?: string | null;
};

/** Faixas novas deste lote que ainda precisam de mix, trim ou tags na revisão. */
export function itemPrecisaRevisaoEdicao(item: RevisaoItemRef): boolean {
  if (item.status !== "concluido" || !item.musicaId) return false;
  const msg = (item.erroMsg ?? "").trim();
  if (msg.startsWith(REVISAO_ITEM_DESCARTADA_PREFIX)) return false;
  return true;
}

export function musicaIdsParaRevisaoEdicao(itens: RevisaoItemRef[]): string[] {
  return itens.filter(itemPrecisaRevisaoEdicao).map((i) => i.musicaId as string);
}
