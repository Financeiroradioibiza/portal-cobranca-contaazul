import { getConfig, setConfig } from "@/lib/config/portalConfigService";

export const MIGRACAO_PRIORIDADE_CONFIG_KEY = "suporte.migracao_prioridade";

export type MigracaoPrioridadeMap = Record<string, number>;

function parseMap(raw: string | null): MigracaoPrioridadeMap {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: MigracaoPrioridadeMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const ref = k.trim();
      const n = typeof v === "number" ? v : Number(v);
      if (!ref || !Number.isFinite(n)) continue;
      out[ref] = Math.trunc(n);
    }
    return out;
  } catch {
    return {};
  }
}

export async function readMigracaoPrioridadeMap(): Promise<MigracaoPrioridadeMap> {
  const raw = await getConfig(MIGRACAO_PRIORIDADE_CONFIG_KEY);
  return parseMap(raw);
}

export async function setMigracaoPrioridadeForCliente(
  clienteRef: string,
  prioridade: number | null,
  updatedBy: string,
): Promise<MigracaoPrioridadeMap> {
  const ref = clienteRef.trim();
  if (!ref) throw new Error("cliente_ref_invalido");

  const map = await readMigracaoPrioridadeMap();
  if (prioridade == null || !Number.isFinite(prioridade)) {
    delete map[ref];
  } else {
    map[ref] = Math.trunc(prioridade);
  }

  await setConfig(MIGRACAO_PRIORIDADE_CONFIG_KEY, JSON.stringify(map), updatedBy);
  return map;
}
