import { caFetch } from "./caHttp";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickHttpUrlFromRow(row: Record<string, unknown>): string | null {
  const direct = [
    row.url_danfe,
    row.urlDanfe,
    row.link_danfe,
    row.linkDanfe,
    row.url_danfe_xml,
    row.url_xml,
    row.urlXml,
    row.link_pdf,
    row.linkPdf,
    row.url_pdf,
    row.urlPdf,
    row.url,
    row.link,
    row.pdf,
  ];
  for (const c of direct) {
    const s = str(c);
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  if (isRecord(row.arquivo)) {
    const s = str(row.arquivo.url) ?? str(row.arquivo.link) ?? str(row.arquivo.href);
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  return null;
}

type NotasList = {
  itens?: unknown[];
  items?: unknown[];
};

/**
 * Quando a NF-e não vem como anexo da parcela, tenta localizar link via
 * GET /v1/notas-fiscais (id_venda + janela de datas).
 */
export async function tryResolveNfeDownloadUrl(
  accessToken: string,
  opts: {
    idVenda?: string;
    dataRef?: string;
    numeroNota?: number;
  },
): Promise<string | null> {
  const idV = opts.idVenda?.trim();
  if (!idV) return null;

  const ref = (opts.dataRef ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const d = new Date(`${ref}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const start = new Date(d);
  start.setMonth(start.getMonth() - 4);
  const end = new Date(d);
  end.setMonth(end.getMonth() + 2);
  const data_inicial = start.toISOString().slice(0, 10);
  const data_final = end.toISOString().slice(0, 10);

  const tryList = async (withNumero: boolean) => {
    const qs = new URLSearchParams({
      data_inicial,
      data_final,
      pagina: "1",
      tamanho_pagina: "50",
      id_venda: idV,
    });
    if (withNumero && opts.numeroNota != null && opts.numeroNota > 0) {
      qs.set("numero_nota", String(opts.numeroNota));
    }
    return caFetch<NotasList>(`/v1/notas-fiscais?${qs.toString()}`, accessToken);
  };

  let list: NotasList;
  try {
    if (opts.numeroNota != null && opts.numeroNota > 0) {
      try {
        list = await tryList(true);
      } catch {
        list = await tryList(false);
      }
    } else {
      list = await tryList(false);
    }
  } catch {
    return null;
  }

  const rows = list.itens ?? list.items ?? [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const url = pickHttpUrlFromRow(raw);
    if (url) return url;

    const chave = str(raw.chave_acesso) ?? str(raw.chaveAcesso);
    if (!chave) continue;
    try {
      const one = await caFetch<Record<string, unknown>>(
        `/v1/notas-fiscais/${encodeURIComponent(chave)}`,
        accessToken,
      );
      const u = pickHttpUrlFromRow(one);
      if (u) return u;
    } catch {
      /* nota individual pode não expor link na sua instalação */
    }
  }

  return null;
}
