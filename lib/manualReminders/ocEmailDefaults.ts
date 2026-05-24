export const OC_EMAIL_DEFAULT_SUBJECT = `{{empresaNome}} — Solicitação de ordem de compra ({{mesLabel}})`;

/** Versão inicial do modelo (antes do texto «automático»); usada só para atualizar Postgres se ainda for idêntica. */
export const LEGACY_OC_EMAIL_BODY_V1 = `Olá,

Somos da cobrança da {{empresaNome}}.

Para formalizarmos a faturação referente a {{mesLabel}}, precisamos receber a ordem de compra (OC) do cadastro "{{clienteNome}}", com o número que deverá ser informado nos detalhes da nota fiscal.

Pode responder a este e-mail anexando a OC ou informando o número para registro?

Obrigado(a),
{{empresaNome}}
Cobrança — cobranca@radioibiza.com.br
`;

/** Corpo padrão (texto simples; webmail Locaweb pode colar quebras de linha). */
export const OC_EMAIL_DEFAULT_BODY = `Olá,

Este é um e-mail automático enviado pela {{empresaNome}} solicitando sua colaboração.

Para formalizarmos a faturação referente a {{mesLabel}}, precisamos receber a ordem de compra (OC) do cadastro "{{clienteNome}}", com o número que deverá ser informado nos detalhes da nota fiscal.

Pode responder a este e-mail anexando a OC ou informando o número para registro?

Obrigado(a),
{{empresaNome}}
Cobrança — cobranca@radioibiza.com.br
`;

export function defaultTemplateSeed() {
  return {
    id: "default" as const,
    subject: OC_EMAIL_DEFAULT_SUBJECT,
    bodyText: OC_EMAIL_DEFAULT_BODY,
  };
}
