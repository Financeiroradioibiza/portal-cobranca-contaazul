import { COMPANY_NAME } from "@/lib/brand";

/** Placeholders suportados pelo renderizador (`{{chave}}`). */
export const OC_EMAIL_PLACEHOLDER_KEYS = ["clienteNome", "mesLabel", "empresaNome", "cnpjDocumento"] as const;

export type OcEmailVars = {
  clienteNome: string;
  /** Competência de faturação: mês civil **anterior** à data de envio (horário Brasil). */
  mesLabel: string;
  empresaNome: string;
  cnpjDocumento: string;
};

export function buildOcEmailVars(partial: Partial<OcEmailVars> & Pick<OcEmailVars, "clienteNome" | "mesLabel">): OcEmailVars {
  return {
    clienteNome: partial.clienteNome.trim() || "Cliente",
    mesLabel: partial.mesLabel.trim() || "—",
    empresaNome: (partial.empresaNome ?? COMPANY_NAME).trim() || COMPANY_NAME,
    cnpjDocumento: (partial.cnpjDocumento ?? "—").trim() || "—",
  };
}

/**
 * Substitui `{{chave}}` no texto (apenas chaves alfanuméricas conhecidas).
 */
export function renderOcEmailText(template: string, vars: OcEmailVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
    if (key in vars) {
      return String((vars as Record<string, string>)[key] ?? "");
    }
    return m;
  });
}

export function parseOcEmailRecipients(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const chunks = raw.split(/[\s;]+/).flatMap((part) => part.split(","));
  const out: string[] = [];
  for (const c of chunks) {
    const t = c.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(t)) out.push(t);
  }
  return [...new Set(out)];
}
