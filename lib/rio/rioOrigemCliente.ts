/** Etiqueta ao lado do nome do cliente na Planilha Rio. */
export type RioOrigemCliente = "" | "APP" | "MANUAL";

export const RIO_ORIGEM_CLIENTE_OPTS: ReadonlyArray<{ value: RioOrigemCliente; label: string }> = [
  { value: "", label: "—" },
  { value: "APP", label: "APP" },
  { value: "MANUAL", label: "MANUAL" },
];

export function normalizeRioOrigemCliente(v: unknown): RioOrigemCliente {
  const t = typeof v === "string" ? v.trim().toUpperCase() : "";
  return t === "APP" || t === "MANUAL" ? t : "";
}

export function rioOrigemClienteSuffix(origem: string | null | undefined): string | null {
  const o = normalizeRioOrigemCliente(origem ?? "");
  return o ? `(${o})` : null;
}
