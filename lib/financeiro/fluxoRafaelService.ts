import { prisma } from "@/lib/prisma";
import { setConfig } from "@/lib/config/portalConfigService";

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

export type FluxoRafaelStore = {
  dados: FluxoRafaelDados;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getFluxoRafaelStore(): Promise<FluxoRafaelStore> {
  const row = await prisma.portalConfig.findUnique({
    where: { chave: FLUXO_RAFAEL_CONFIG_KEY },
  });
  if (!row?.valor) {
    return { dados: {}, updatedAt: null, updatedBy: null };
  }
  try {
    return {
      dados: JSON.parse(row.valor) as FluxoRafaelDados,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy || null,
    };
  } catch {
    return { dados: {}, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy || null };
  }
}

/** @deprecated Prefer getFluxoRafaelStore */
export async function getFluxoRafaelDados(): Promise<FluxoRafaelDados | null> {
  const store = await getFluxoRafaelStore();
  return Object.keys(store.dados).length > 0 ? store.dados : null;
}

export async function setFluxoRafaelDados(dados: FluxoRafaelDados, updatedBy: string): Promise<void> {
  await setConfig(FLUXO_RAFAEL_CONFIG_KEY, JSON.stringify(dados), updatedBy);
}
