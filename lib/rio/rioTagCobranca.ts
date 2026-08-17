export type RioTagCobranca = "cobrando" | "cancelado" | "bloqueio_financeiro" | "cortesia";

export const RIO_TAG_COBRANCA_OPTS: ReadonlyArray<{ value: RioTagCobranca; label: string }> = [
  { value: "cobrando", label: "COBRANDO" },
  { value: "cortesia", label: "CORTESIA" },
  { value: "cancelado", label: "CANCELADO" },
  { value: "bloqueio_financeiro", label: "Bloqueio financeiro" },
];

export function normalizeRioTagCobranca(v: unknown): RioTagCobranca {
  if (v === "cancelado" || v === "bloqueio_financeiro" || v === "cortesia") return v;
  return "cobrando";
}

export function rioTagCobrancaSuffix(tag: RioTagCobranca | null | undefined): string | null {
  if (!tag || tag === "cobrando") return null;
  if (tag === "cancelado") return "cancelado";
  if (tag === "cortesia") return "CORTESIA";
  return "Bloqueio financeiro";
}

export function rioTagCobrancaTextClass(tag: RioTagCobranca | null | undefined): string {
  if (tag === "cancelado") return "text-red-600 dark:text-red-400 font-semibold";
  if (tag === "cortesia") return "text-violet-600 dark:text-violet-300 font-semibold";
  if (tag === "bloqueio_financeiro") return "text-orange-600 dark:text-orange-300 font-semibold";
  return "";
}

/** Tag efetiva: PDV específica prevalece; senão herda da linha Rio. */
export function effectiveRioTagCobranca(
  pdvTag?: RioTagCobranca | null,
  linhaTag?: RioTagCobranca | null,
): RioTagCobranca {
  const pt = normalizeRioTagCobranca(pdvTag);
  const lt = normalizeRioTagCobranca(linhaTag);
  if (pt !== "cobrando") return pt;
  return lt;
}

/** PDV entra no Nº PDV / valor (cobrando e bloqueio financeiro sim; cancelado e cortesia não). */
export function rioPdvContaParaCobranca(
  pdvTag?: RioTagCobranca | null,
  linhaTag?: RioTagCobranca | null,
): boolean {
  const tag = effectiveRioTagCobranca(pdvTag, linhaTag);
  return tag !== "cancelado" && tag !== "cortesia";
}

/** Tag Rio que deve inativar o PDV no gateway (Player para ao pingar). */
export function rioTagCobrancaBloqueiaPlayer(tag: RioTagCobranca | null | undefined): boolean {
  const t = normalizeRioTagCobranca(tag);
  return t === "cancelado" || t === "bloqueio_financeiro";
}

export function rioTagCobrancaRowBgClass(tag: RioTagCobranca | null | undefined): string {
  if (tag === "cancelado") {
    return "border-red-300/60 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35";
  }
  if (tag === "cortesia") {
    return "border-violet-300/60 bg-violet-50/90 dark:border-violet-900/50 dark:bg-violet-950/35";
  }
  if (tag === "bloqueio_financeiro") {
    return "border-orange-300/60 bg-orange-50/90 dark:border-orange-900/50 dark:bg-orange-950/35";
  }
  return "";
}

/** Parse coluna «Status» de importações (ex.: Cobrando, Cancelado). */
export function parseRioTagCobrancaFromImport(raw: string | null | undefined): RioTagCobranca {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t || t === "cobrando" || t === "ativo") return "cobrando";
  if (t.includes("cancel")) return "cancelado";
  if (t.includes("cortesia")) return "cortesia";
  if (t.includes("bloqueio")) return "bloqueio_financeiro";
  return "cobrando";
}
