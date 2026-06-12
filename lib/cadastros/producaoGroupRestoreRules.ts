import { stripDiacritics } from "@/lib/radioPainel/exportClientesCsv";

export function normalizeNomeToken(nome: string): string {
  return stripDiacritics(nome).toLowerCase().trim();
}

export type GroupMatchContext = {
  bucketNome: string;
  pdvNome: string;
  label: string;
};

export type GroupRestoreRule = {
  groupName: string;
  /** Move todos os PDVs do bucket quando o nome do bucket combina (ex.: HERING Dubelas Franquias). */
  moveWholeBucket?: boolean;
  match: (ctx: GroupMatchContext, bucketPdvCount: number) => boolean;
};

export function includesNormalized(ctx: GroupMatchContext, token: string): boolean {
  const t = normalizeNomeToken(token);
  if (!t) return false;
  const parts = [ctx.bucketNome, ctx.pdvNome, ctx.label].map(normalizeNomeToken);
  return parts.some((p) => p.includes(t));
}

function makeIncludesRule(groupName: string, ...tokens: string[]): GroupRestoreRule {
  return {
    groupName,
    match: (ctx) => tokens.some((t) => includesNormalized(ctx, t)),
  };
}

export const HERING_MASTER_GROUP_NAME = "Hering";

function isHeringProprias(ctx: GroupMatchContext): boolean {
  const combined = normalizeNomeToken(`${ctx.bucketNome} ${ctx.pdvNome}`);
  return /\bpropria(s)?\b/.test(combined);
}

/** Franquias / grupos HERING → pasta «Hering». Próprias e lojas 1 PDV (HERINGTODAS) ficam de fora. */
export const heringMasterGroupRule: GroupRestoreRule = {
  groupName: HERING_MASTER_GROUP_NAME,
  moveWholeBucket: true,
  match: (ctx, bucketPdvCount) => {
    if (isHeringProprias(ctx)) return false;

    const bucket = normalizeNomeToken(ctx.bucketNome);
    if (!bucket.includes("hering")) return false;

    if (bucketPdvCount > 1) return true;
    if (bucket.includes("dubelas") || bucket.includes("franquia")) return true;
    if (/\bhering\s*2\b/.test(bucket)) return true;

    const pdv = normalizeNomeToken(ctx.pdvNome);
    if (bucketPdvCount === 1 && pdv.startsWith("hering")) return false;

    return false;
  },
};

/** Marcas com pasta manual (1 PDV por loja Rio → pasta da marca). HERINGTODAS é botão separado. */
export const PRODUCAO_GROUP_RESTORE_RULES: GroupRestoreRule[] = [
  makeIncludesRule("Agilitá", "agilita"),
  makeIncludesRule("Banzeiro", "banzeiro"),
  makeIncludesRule("Atelier Mix", "atelier mix"),
  makeIncludesRule("Bleriot", "bleriot"),
  makeIncludesRule("Boteco Rainha", "boteco rainha"),
  makeIncludesRule("Boteco Princesa", "boteco princesa"),
  makeIncludesRule("Braca", "braca"),
  makeIncludesRule("Brewteco", "brewteco"),
  makeIncludesRule("Burger Boss", "burger boss"),
  makeIncludesRule("Cafe zinn", "cafe zinn", "zinn"),
  makeIncludesRule("Capodarte", "capodarte"),
  makeIncludesRule("Capricciosa", "capricciosa"),
  makeIncludesRule("Carol Rossato", "carol rossato"),
  makeIncludesRule("Casa Francis", "casa francis"),
  makeIncludesRule("Casa Portena", "casa portena"),
  makeIncludesRule("Espetto Carioca", "espetto carioca"),
  makeIncludesRule("Esquina do Souza", "esquina do souza"),
  makeIncludesRule("Farm Casa", "farm casa"),
  makeIncludesRule("Frutaria São Paulo", "frutaria sao paulo"),
  makeIncludesRule("Geneal", "geneal"),
  makeIncludesRule("Honda Caiuas", "honda caiuas"),
  makeIncludesRule("Iraja Redux", "iraja redux"),
  makeIncludesRule("Mane", "mane"),
  makeIncludesRule("Panino", "panino"),
  makeIncludesRule("Taco", "taco"),
  makeIncludesRule("Via Mia", "via mia"),
  makeIncludesRule("Vans Store Franquias", "vans"),
  heringMasterGroupRule,
];

export function ruleForGroupName(groupName: string): GroupRestoreRule | undefined {
  const target = groupName.trim().toUpperCase();
  return PRODUCAO_GROUP_RESTORE_RULES.find((r) => r.groupName.trim().toUpperCase() === target);
}
