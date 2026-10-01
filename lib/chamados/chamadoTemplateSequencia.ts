import {
  prazoToIsoDate,
  prazosDiasUteisPorEtapa,
  prazosDivididosAteInstalacao,
  prazosUmDiaUtilPorEtapa,
} from "@/lib/chamados/chamadoPrazoUtils";

export type ChamadoTemplateKind = "padrao" | "cliente_novo" | "vinhetas";

export type SequenciaStepDraft = {
  key: string;
  enabled: boolean;
  ordem: number;
  rotulo: string;
  descricao: string;
  setores: string[];
  responsaveisExtras: string[];
  prazoEm: string;
};

export type PrazoModo = "um_dia_util" | "dois_dias_uteis" | "data_instalacao";

/** @deprecated alias */
export type ClienteNovoStepDraft = SequenciaStepDraft;

const CLIENTE_NOVO_STEPS: Omit<SequenciaStepDraft, "ordem" | "enabled" | "prazoEm">[] = [
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

export function defaultVinhetasRafaelEmail(participants: { email: string; displayName: string }[]): string {
  const env = process.env.CHAMADO_VINHETAS_RAFAEL_EMAIL?.trim();
  if (env && env.includes("@")) return env;
  const hit = participants.find(
    (p) =>
      p.displayName.toLowerCase().includes("rafael") ||
      p.email.toLowerCase().includes("rafael") ||
      p.email.toLowerCase().includes("rafagasparian"),
  );
  return hit?.email ?? "";
}

function vinhetasSteps(rafaelEmail: string): Omit<SequenciaStepDraft, "ordem" | "enabled" | "prazoEm">[] {
  return [
    {
      key: "criacao_vinheta",
      rotulo: "1 · Criação de vinheta",
      descricao: "Pedido de criação de vinheta.",
      setores: [],
      responsaveisExtras: rafaelEmail ? [rafaelEmail] : [],
    },
    {
      key: "subida_producao",
      rotulo: "2 · Subida em cliente (Produção)",
      descricao: "Pedido de subida de vinheta em cliente para produção.",
      setores: ["producao"],
      responsaveisExtras: [],
    },
  ];
}

function attachPrazos(
  defs: Omit<SequenciaStepDraft, "ordem" | "enabled" | "prazoEm">[],
  prazos: Date[],
): SequenciaStepDraft[] {
  return defs.map((s, i) => ({
    ...s,
    ordem: i + 1,
    enabled: true,
    prazoEm: prazoToIsoDate(prazos[i] ?? prazos[prazos.length - 1]!),
  }));
}

export function buildDefaultClienteNovoSteps(
  from: Date,
  modo: PrazoModo,
  dataInstalacao?: string,
): SequenciaStepDraft[] {
  const n = CLIENTE_NOVO_STEPS.length;
  const prazos =
    modo === "data_instalacao" && dataInstalacao ?
      prazosDivididosAteInstalacao(from, new Date(dataInstalacao + "T12:00:00"), n)
    : prazosUmDiaUtilPorEtapa(from, n);
  return attachPrazos(CLIENTE_NOVO_STEPS, prazos);
}

export function buildDefaultVinhetasSteps(
  from: Date,
  rafaelEmail: string,
  diasUteisPorEtapa = 2,
): SequenciaStepDraft[] {
  const defs = vinhetasSteps(rafaelEmail);
  const prazos = prazosDiasUteisPorEtapa(from, defs.length, diasUteisPorEtapa);
  return attachPrazos(defs, prazos);
}

export function enabledSteps(steps: SequenciaStepDraft[]): SequenciaStepDraft[] {
  return [...steps].filter((s) => s.enabled).sort((a, b) => a.ordem - b.ordem);
}

export function parseSequenciaSteps(raw: unknown): SequenciaStepDraft[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: SequenciaStepDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim().slice(0, 40) : "";
    if (!key) continue;
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

/** @deprecated */
export const parseClienteNovoSteps = parseSequenciaSteps;
