import type { CaInstallmentDetail } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function concatArrays(data: Record<string, unknown>, keys: string[]): unknown[] {
  const out: unknown[] = [];
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) out.push(...v);
  }
  return out;
}

/**
 * Conta Azul costuma responder em snake_case na doc; o JSON real pode vir camelCase.
 */
export function normalizeInstallmentDetail(data: unknown): CaInstallmentDetail {
  if (!isRecord(data)) return {};

  const anexosIn = concatArrays(data, [
    "anexos",
    "anexosParcela",
    "anexos_parcela",
    "attachments",
    "documentos",
    "documents",
  ]);

  const solicIn = concatArrays(data, [
    "solicitacoes_cobrancas",
    "solicitacoesCobrancas",
    "solicitacoesCobranca",
    "cobrancas",
    "solicitacoesPagamento",
    "solicitacoes_pagamento",
    "meios_cobranca",
    "meiosCobranca",
  ]);

  const anexos: CaInstallmentDetail["anexos"] = [];
  const seenAnexoUrl = new Set<string>();
  for (const a of anexosIn) {
    if (!isRecord(a)) continue;
    const url =
      str(a.url) ??
      str(a.link) ??
      str(a.href) ??
      str(a.publicUrl) ??
      str(a.public_url) ??
      str(a.arquivoUrl) ??
      (isRecord(a.arquivo) ? str(a.arquivo.url) ?? str(a.arquivo.link) : undefined);
    const tipoAnexo =
      str(a.tipo_anexo) ?? str(a.tipoAnexo) ?? str(a.tipo) ?? str(a.tipoDocumento);
    if (url && seenAnexoUrl.has(url)) continue;
    if (url) seenAnexoUrl.add(url);
    anexos.push({
      url: url ?? null,
      tipo_anexo: tipoAnexo,
      nome: str(a.nome) ?? str(a.name) ?? null,
      descricao: str(a.descricao) ?? str(a.description) ?? null,
    });
  }

  const solicitacoes_cobrancas: NonNullable<CaInstallmentDetail["solicitacoes_cobrancas"]> =
    [];
  const seenSolicUrl = new Set<string>();
  for (const s of solicIn) {
    if (!isRecord(s)) continue;
    const url =
      str(s.url) ??
      str(s.link) ??
      str(s.href) ??
      str(s.linkPagamento) ??
      str(s.link_pagamento) ??
      str(s.urlBoleto) ??
      str(s.url_boleto) ??
      str(s.urlPagamento) ??
      str(s.url_pagamento);
    const tipo =
      str(s.tipo_solicitacao_cobranca) ??
      str(s.tipoSolicitacaoCobranca) ??
      str(s.tipo) ??
      str(s.tipoCobranca);
    if (url && seenSolicUrl.has(url)) continue;
    if (url) seenSolicUrl.add(url);
    if (url || tipo) {
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
