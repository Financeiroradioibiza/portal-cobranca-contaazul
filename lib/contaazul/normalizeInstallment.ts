import type { CaInstallmentDetail } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Conta Azul costuma responder em snake_case na doc; o JSON real pode vir camelCase.
 */
export function normalizeInstallmentDetail(data: unknown): CaInstallmentDetail {
  if (!isRecord(data)) return {};
  const anexosRaw = data.anexos;
  const solicRaw =
    data.solicitacoes_cobrancas ?? data.solicitacoesCobrancas ?? data.solicitacoesCobranca;

  const anexos: CaInstallmentDetail["anexos"] = [];
  if (Array.isArray(anexosRaw)) {
    for (const a of anexosRaw) {
      if (!isRecord(a)) continue;
      const url =
        str(a.url) ??
        str(a.link) ??
        str(a.href) ??
        str(a.publicUrl) ??
        str(a.public_url) ??
        (isRecord(a.arquivo) ? str(a.arquivo.url) : undefined);
      const tipoAnexo = str(a.tipo_anexo) ?? str(a.tipoAnexo) ?? str(a.tipo);
      anexos.push({
        url: url ?? null,
        tipo_anexo: tipoAnexo,
        nome: str(a.nome) ?? null,
        descricao: str(a.descricao) ?? null,
      });
    }
  }

  const solicitacoes_cobrancas: NonNullable<CaInstallmentDetail["solicitacoes_cobrancas"]> =
    [];
  if (Array.isArray(solicRaw)) {
    for (const s of solicRaw) {
      if (!isRecord(s)) continue;
      const url =
        str(s.url) ??
        str(s.link) ??
        str(s.href) ??
        str(s.linkPagamento) ??
        str(s.link_pagamento);
      const tipo =
        str(s.tipo_solicitacao_cobranca) ??
        str(s.tipoSolicitacaoCobranca) ??
        str(s.tipo);
      solicitacoes_cobrancas.push({
        url: url ?? null,
        tipo_solicitacao_cobranca: tipo,
      });
    }
  }

  return {
    id: str(data.id),
    anexos: anexos.length ? anexos : undefined,
    solicitacoes_cobrancas: solicitacoes_cobrancas.length
      ? solicitacoes_cobrancas
      : undefined,
  };
}
