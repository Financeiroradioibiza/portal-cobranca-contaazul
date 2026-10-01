import {
  prazoToIsoDate,
  prazosDivididosAteInstalacao,
  prazosUmDiaUtilPorEtapa,
} from "@/lib/chamados/chamadoPrazoUtils";

export type ChamadoTemplateKind = "padrao" | "cliente_novo";

export type ClienteNovoStepKey = "financeiro" | "criacao" | "producao" | "instalacao";

export type ClienteNovoStepDraft = {
  key: ClienteNovoStepKey;
  enabled: boolean;
  ordem: number;
  rotulo: string;
  descricao: string;
  setores: string[];
  /** E-mails além de quem abriu o fluxo (sempre incluído no servidor). */
  responsaveisExtras: string[];
  prazoEm: string;
};

const STEP_DEFAULTS: Omit<ClienteNovoStepDraft, "ordem" | "enabled" | "prazoEm">[] = [
  {
    key: "financeiro",
    rotulo: "1 · Financeiro",
    descricao: "Financeiro, favor criar cliente.",
    setores: ["financeiro"],
    responsaveisExtras: [],
  },
  {
    key: "criacao",
    rotulo: "2 · Criação musical",
    descricao: "Criação, favor enviar à Produção a programação musical.",
    setores: ["criacao"],
    responsaveisExtras: [],
  },
  {
    key: "producao",
    rotulo: "3 · Produção",
    descricao: "Produção, favor preparar o cliente para instalação.",
    setores: ["producao"],
    responsaveisExtras: [],
  },
  {
    key: "instalacao",
    rotulo: "4 · Instalação",
    descricao: "Suporte, favor instalar cliente.",
    setores: ["suporte"],
    responsaveisExtras: [],
  },
];

export type PrazoModo = "um_dia_util" | "data_instalacao";

export function buildDefaultClienteNovoSteps(
  from: Date,
  modo: PrazoModo,
  dataInstalacao?: string,
): ClienteNovoStepDraft[] {
  const enabledCount = STEP_DEFAULTS.length;
  const prazos =
    modo === "data_instalacao" && dataInstalacao ?
      prazosDivididosAteInstalacao(from, new Date(dataInstalacao + "T12:00:00"), enabledCount)
    : prazosUmDiaUtilPorEtapa(from, enabledCount);

  return STEP_DEFAULTS.map((s, i) => ({
    ...s,
    ordem: i + 1,
    enabled: true,
    prazoEm: prazoToIsoDate(prazos[i]!),
  }));
}

export function enabledSteps(steps: ClienteNovoStepDraft[]): ClienteNovoStepDraft[] {
  return [...steps].filter((s) => s.enabled).sort((a, b) => a.ordem - b.ordem);
}

export function parseClienteNovoSteps(raw: unknown): ClienteNovoStepDraft[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ClienteNovoStepDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = o.key;
    if (key !== "financeiro" && key !== "criacao" && key !== "producao" && key !== "instalacao") continue;
    out.push({
      key,
      enabled: o.enabled !== false,
      ordem: typeof o.ordem === "number" ? o.ordem : out.length + 1,
      rotulo: typeof o.rotulo === "string" ? o.rotulo.slice(0, 120) : "",
      descricao: typeof o.descricao === "string" ? o.descricao.slice(0, 8000) : "",
      setores: Array.isArray(o.setores) ? o.setores.filter((x): x is string => typeof x === "string") : [],
      responsaveisExtras: Array.isArray(o.responsaveisExtras) ?
        o.responsaveisExtras.filter((x): x is string => typeof x === "string")
      : [],
      prazoEm: typeof o.prazoEm === "string" ? o.prazoEm.slice(0, 10) : "",
    });
  }
  return out.length ? out : null;
}
