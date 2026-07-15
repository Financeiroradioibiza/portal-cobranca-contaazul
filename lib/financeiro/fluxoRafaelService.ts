import { getConfig, setConfig } from "@/lib/config/portalConfigService";

export const FLUXO_RAFAEL_CONFIG_KEY = "financeiro.fluxo_rafael.dados";

export type FluxoRafaelDados = {
  urlKey?: string;
  cm?: string;
  theme?: string;
  idleMin?: number;
  previstos?: unknown[];
  lanc?: Record<string, unknown[]>;
  si?: Record<string, number>;
  receb?: Record<string, unknown[]>;
  prevReal?: Record<string, { valor: number; confirmadoEm?: string; desc?: string }>;
  prevDesativ?: Record<string, boolean>;
  cats?: { E: string[]; S: string[] };
};

export async function getFluxoRafaelDados(): Promise<FluxoRafaelDados | null> {
  const raw = await getConfig(FLUXO_RAFAEL_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FluxoRafaelDados;
  } catch {
    return null;
  }
}

export async function setFluxoRafaelDados(dados: FluxoRafaelDados, updatedBy: string): Promise<void> {
  await setConfig(FLUXO_RAFAEL_CONFIG_KEY, JSON.stringify(dados), updatedBy);
}
