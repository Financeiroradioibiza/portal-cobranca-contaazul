export type RioTagCobranca = "cobrando" | "cancelado" | "bloqueio_financeiro";

export const RIO_TAG_COBRANCA_OPTS: ReadonlyArray<{ value: RioTagCobranca; label: string }> = [
  { value: "cobrando", label: "COBRANDO" },
  { value: "cancelado", label: "CANCELADO" },
  { value: "bloqueio_financeiro", label: "Bloqueio financeiro" },
];

export function normalizeRioTagCobranca(v: unknown): RioTagCobranca {
  if (v === "cancelado" || v === "bloqueio_financeiro") return v;
  return "cobrando";
}

export function rioTagCobrancaSuffix(tag: RioTagCobranca | null | undefined): string | null {
  if (!tag || tag === "cobrando") return null;
  if (tag === "cancelado") return "cancelado";
  return "Bloqueio financeiro";
}

export function rioTagCobrancaTextClass(tag: RioTagCobranca | null | undefined): string {
  if (tag === "cancelado") return "text-red-600 dark:text-red-400";
  if (tag === "bloqueio_financeiro") return "text-orange-600 dark:text-orange-400";
  return "";
}

export function rioTagCobrancaRowBgClass(tag: RioTagCobranca | null | undefined): string {
  if (tag === "cancelado") {
    return "border-red-300/60 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35";
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
  if (t.includes("bloqueio")) return "bloqueio_financeiro";
  return "cobrando";
}
