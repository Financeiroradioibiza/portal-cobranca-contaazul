/** Etiqueta ao lado do nome do cliente na Planilha Rio. */
export type RioOrigemCliente = "" | "APP" | "OC" | "PERMUTA";

export const RIO_ORIGEM_CLIENTE_OPTS: ReadonlyArray<{ value: RioOrigemCliente; label: string }> = [
  { value: "", label: "—" },
  { value: "APP", label: "APP" },
  { value: "OC", label: "OC" },
  { value: "PERMUTA", label: "PERMUTA" },
];

const RIO_ORIGEM_VALID = new Set<RioOrigemCliente>(["APP", "OC", "PERMUTA"]);

export function normalizeRioOrigemCliente(v: unknown): RioOrigemCliente {
  const t = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (t === "MANUAL") return "OC";
  return RIO_ORIGEM_VALID.has(t as RioOrigemCliente) ? (t as RioOrigemCliente) : "";
}

export function rioOrigemClienteHasEtiqueta(origem: string | null | undefined): boolean {
  return normalizeRioOrigemCliente(origem ?? "") !== "";
}

export function rioOrigemClienteSuffix(origem: string | null | undefined): string | null {
  const o = normalizeRioOrigemCliente(origem ?? "");
  return o ? `(${o})` : null;
}
