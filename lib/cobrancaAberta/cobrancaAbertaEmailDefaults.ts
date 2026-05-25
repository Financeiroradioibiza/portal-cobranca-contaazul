/** Id único na tabela Postgres (seed). */
export const COBRANCA_ABERTA_TEMPLATE_ID = "default";

export const COBRANCA_ABERTA_SUBJECT_DEFAULT = "Cobranças em aberto Radio Ibiza";

export const COBRANCA_ABERTA_BODY_DEFAULT = `Olá {{CLIENTE}},

Esse é um e-mail automático da {{MARCA}} para informar que há cobranças em aberto no CNPJ {{CNPJ}}.

Resumo das cobranças vencidas em aberto:
{{TABELA_PARCELAS}}

Total em aberto: {{TOTAL}}

—
{{MARCA}}`;

export function defaultCobrancaAbertaTemplateSeed(): {
  id: string;
  subject: string;
  bodyText: string;
} {
  return {
    id: COBRANCA_ABERTA_TEMPLATE_ID,
    subject: COBRANCA_ABERTA_SUBJECT_DEFAULT,
    bodyText: COBRANCA_ABERTA_BODY_DEFAULT,
  };
}

/** Substituir {{CHAVE}} (sem Regex). */
export function applyCobrancaAbertaPlaceholders(body: string, vars: Record<string, string>): string {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}
