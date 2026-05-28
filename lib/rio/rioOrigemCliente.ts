/** Etiqueta ao lado do nome do cliente na Planilha Rio. */
export type RioOrigemCliente = "" | "APP" | "OC";

export const RIO_ORIGEM_CLIENTE_OPTS: ReadonlyArray<{ value: RioOrigemCliente; label: string }> = [
  { value: "", label: "—" },
  { value: "APP", label: "APP" },
  { value: "OC", label: "OC" },
];

export function normalizeRioOrigemCliente(v: unknown): RioOrigemCliente {
  const t = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (t === "MANUAL") return "OC";
  return t === "APP" || t === "OC" ? t : "";
}

export function rioOrigemClienteSuffix(origem: string | null | undefined): string | null {
  const o = normalizeRioOrigemCliente(origem ?? "");
  return o ? `(${o})` : null;
}
