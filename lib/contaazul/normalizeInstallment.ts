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
  if (isRecord(data.evento)) {
    const ev = data.evento as Record<string, unknown>;
    anexosIn.push(
      ...concatArrays(ev, ["anexos", "attachments", "documentos", "documents"]),
    );
    if (isRecord(ev.notaFiscal)) {
      anexosIn.push(ev.notaFiscal);
    }
    if (isRecord(ev.nota_fiscal)) {
      anexosIn.push(ev.nota_fiscal);
    }
  }

  if (Array.isArray(data.baixas)) {
    for (const bx of data.baixas) {
      if (!isRecord(bx)) continue;
      const baixaId = str(bx.id);
      const bxAnexos = concatArrays(bx, ["anexos", "attachments"]);
      for (const raw of bxAnexos) {
        if (isRecord(raw)) {
          (raw as Record<string, unknown>).__baixaId = baixaId ?? "";
        }
        anexosIn.push(raw);
      }
    }
  }

  if (isRecord(data.fatura)) {
    anexosIn.push(data.fatura);
  }

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
  const seenAnexo = new Set<string>();
  for (const a of anexosIn) {
    if (!isRecord(a)) continue;
    const url =
      str(a.url) ??
      str(a.link) ??
      str(a.href) ??
      str(a.publicUrl) ??
      str(a.public_url) ??
      str(a.arquivoUrl) ??
      str(a.urlDanfe) ??
      str(a.url_danfe) ??
      str(a.linkDanfe) ??
      str(a.link_danfe) ??
      str(a.pdf) ??
      str(a.xml) ??
      (isRecord(a.arquivo) ? str(a.arquivo.url) ?? str(a.arquivo.link) : undefined);
    const anexoId = str(a.id) ?? str(a.id_anexo) ?? str(a.idAnexo);
    const tipoConteudo = str(a.tipo_conteudo) ?? str(a.tipoConteudo);
    const baixaFromRaw =
      str((a as Record<string, unknown>).__baixaId)?.trim() || undefined;
    const idBaixa =
      str(a.id_baixa) ??
      str(a.idBaixa) ??
      (baixaFromRaw ? baixaFromRaw : undefined);

    const tipoAnexo =
      str(a.tipo_anexo) ??
      str(a.tipoAnexo) ??
      str(a.tipo) ??
      str(a.tipoDocumento) ??
      str(a.tipo_fatura) ??
      str(a.tipoFatura);
    const dedupeKey = url ?? anexoId ?? "";
    if (dedupeKey && seenAnexo.has(dedupeKey)) continue;
    if (dedupeKey) seenAnexo.add(dedupeKey);
    anexos.push({
      id: anexoId,
      url: url ?? null,
      tipo_anexo: tipoAnexo,
      tipo_conteudo: tipoConteudo,
      nome: str(a.nome) ?? str(a.name) ?? null,
      descricao: str(a.descricao) ?? str(a.description) ?? null,
      id_baixa: idBaixa ?? null,
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

  let id_venda: string | undefined;
  let data_referencia_nf: string | undefined;
  let numero_fatura: number | undefined;
  let tipo_fatura: string | undefined;
  let numero_nfse: number | undefined;
  let numero_rps: number | undefined;
  let cliente: CaInstallmentDetail["cliente"];

  function pickClienteFrom(o: Record<string, unknown>) {
    if (cliente?.id) return;
    const cRaw = o.cliente ?? (isRecord(o.pessoa) ? o.pessoa : undefined);
    if (isRecord(cRaw)) {
      const cid = str(cRaw.id) ?? str(cRaw.uuid) ?? str(cRaw.id_pessoa);
      if (cid) cliente = { id: cid };
    }
  }

  pickClienteFrom(data as Record<string, unknown>);

  if (isRecord(data.evento)) {
    const ev = data.evento as Record<string, unknown>;
    pickClienteFrom(ev);
    const dc = str(ev.data_competencia) ?? str(ev.dataCompetencia);
    if (dc) data_referencia_nf = dc.slice(0, 10);
    const ref = ev.referencia;
    if (isRecord(ref)) {
      const origem = (str(ref.origem) ?? str(ref.origemReferencia) ?? "").toUpperCase();
      const rid = str(ref.id);
      if (
        rid &&
        (origem === "VENDA" ||
          origem === "VENDA_AGENDADA" ||
          /VENDA/.test(origem))
      ) {
        id_venda = rid;
      }
    }
    id_venda = id_venda ?? str(ev.id_venda) ?? str(ev.idVenda);
  }

  if (!id_venda && isRecord(data.evento)) {
    const tipoEv = (str((data.evento as Record<string, unknown>).tipo) ?? "").toUpperCase();
    if (tipoEv === "RECEITA") {
      const r = str(data.referencia) ?? str(data.idReferencia);
      if (r && /^[0-9a-f-]{36}$/i.test(r)) {
        id_venda = r;
      }
    }
  }

  data_referencia_nf =
    data_referencia_nf ??
    str(data.data_vencimento)?.slice(0, 10) ??
    str(data.dataVencimento)?.slice(0, 10);

  if (isRecord(data.fatura)) {
    const f = data.fatura as Record<string, unknown>;
    tipo_fatura = str(f.tipo_fatura) ?? str(f.tipoFatura);
    const n = f.numero ?? f.numeroFatura ?? f.numero_nota;
    if (typeof n === "number" && Number.isFinite(n)) {
      numero_fatura = n;
    } else if (typeof n === "string" && /^\d+$/.test(n)) {
      numero_fatura = parseInt(n, 10);
    }
    const rps = f.rps ?? f.numero_rps ?? f.numeroRps;
    if (typeof rps === "number" && Number.isFinite(rps)) {
      numero_rps = rps;
    } else if (typeof rps === "string" && /^\d+$/.test(rps)) {
      numero_rps = parseInt(rps, 10);
    }
    const nn = f.numero_nfse ?? f.numeroNfse;
    if (typeof nn === "number" && Number.isFinite(nn)) {
      numero_nfse = nn;
    } else if (typeof nn === "string" && /^\d+$/.test(nn)) {
      numero_nfse = parseInt(nn, 10);
    }
    if (
      !numero_nfse &&
      tipo_fatura?.toUpperCase() === "NFSE" &&
      numero_fatura
    ) {
      numero_nfse = numero_fatura;
    }
  }

  return {
    id: str(data.id),
    id_venda,
    data_referencia_nf,
    numero_fatura,
    tipo_fatura,
    numero_nfse,
    numero_rps,
    cliente: cliente ?? undefined,
    anexos: anexos.length ? anexos : undefined,
    solicitacoes_cobrancas: solicitacoes_cobrancas.length
      ? solicitacoes_cobrancas
      : undefined,
  };
}
