import { caFetch } from "./caHttp";
import type { CaPeopleSearchResponse, CaPerson } from "./types";
import { parseEmailAddresses } from "@/lib/format";
import { caPessoaRowIsActiveCliente } from "./activeClientesCa";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : undefined;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return isRecord(x) ? x : null;
}

/**
 * Detecta primeiro array “de pessoa” dentro do envelope típico do GET `/v1/pessoas`.
 * Exportado para sync Planilha Rio (`tipo_perfil=Cliente`) e outros consumidores.
 */
export function extractCaPessoasListRows(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload.length ? payload : null;

  const root = asRecord(payload);
  if (!root) return null;

  const tryFrom = (obj: Record<string, unknown>): unknown[] | null => {
    const keys = ["items", "itens", "content", "pessoas", "resultado", "resultados"];
    for (const k of keys) {
      const v = obj[k];
      if (Array.isArray(v) && v.length) return v as unknown[];
      if (isRecord(v)) {
        for (const k2 of ["items", "itens"]) {
          const inner = v[k2];
          if (Array.isArray(inner) && inner.length) return inner as unknown[];
        }
      }
    }
    return null;
  };

  let found = tryFrom(root);
  if (found) return found;
  const dr = root.data;
  if (Array.isArray(dr) && dr.length) return dr;
  if (isRecord(dr)) {
    found = tryFrom(dr);
    if (found) return found;
  }
  return null;
}

/** Resumo compatível com variações de GET /v1/pessoas (snake e camelCase). */
export function normalizeCaPersonBrief(
  raw: unknown,
): { id: string; nome: string; documento?: string | null } | null {
  if (!isRecord(raw)) return null;

  const id =
    str(raw.id) ??
    str(raw.uuid) ??
    str(raw.personId) ??
    str(raw.pessoa_id) ??
    str(raw.person_id);
  if (!id) return null;

  const nome =
    str(raw.nome) ??
    str(raw.name) ??
    str(raw.nomeFantasia) ??
    str(raw.nome_fantasia) ??
    str(raw.razaoSocial) ??
    str(raw.razao_social) ??
    str(raw.descricao);

  const doc =
    str(raw.documento) ?? str(raw.doc) ?? str(raw.cnpj) ?? str(raw.cpf) ?? str(raw.cnpj_principal) ?? null;

  return { id, nome: nome || `Cadastro (${id.slice(0, 8)}…)`, documento: doc };
}

/**
 * Tamanho de página permitido pelo OpenAPI Conta Azul em GET /v1/pessoas:
 * 10, 20, 50, 100, 200, 500, 1000 (valores fora disso tendem a responder 400).
 */
const CA_PESSOAS_PAGE_SIZE = "50";

/** GET /v1/pessoas: busca textual + filtro `documentos` para CPF/CNPJ só dígitos. */
export async function searchPeopleByText(
  accessToken: string,
  busca: string,
): Promise<Array<{ id: string; nome: string; documento?: string | null }>> {
  const rawQ = busca.trim().slice(0, 140);
  if (!rawQ) return [];

  const simplified =
    rawQ
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim() || rawQ;
  const digits = rawQ.replace(/\D/g, "");
  const docDigits =
    digits.length >= 11 && digits.length <= 14 ? digits : null;

  /** CNPJ/CPF: priorizar termo só dígitos (API documenta `documentos` e `busca`). */
  const queryCandidates = [...new Set([...(docDigits ? [docDigits] : []), rawQ, simplified])];

  type Params = Record<string, string>;

  const basePaging: Params = {
    pagina: "1",
    tamanho_pagina: CA_PESSOAS_PAGE_SIZE,
    ativo: "true",
  };

  /**
   * Parâmetros documentados em developers.contaazul.com — evitar chaves não listadas (risco de 400).
   * @see https://developers.contaazul.com/open-api-docs/open-api-person/v1/retornapessoasporfiltros
   */
  const paramBundlesForTerm = (term: string): Params[] => {
    const t = term.trim();
    const onlyDoc = /^\d{11,14}$/.test(t);

    if (onlyDoc) {
      return [{ ...basePaging, documentos: t }, { ...basePaging, busca: t }];
    }

    return [{ ...basePaging, busca: t }, { ...basePaging, nomes: t }];
  };

  /** Monta todas as linhas candidatas vindas na resposta. */
  const extractRowsFlat = (data: unknown): Record<string, unknown>[] => {
    const arr = extractCaPessoasListRows(data);
    if (arr?.length) return arr.filter(isRecord) as Record<string, unknown>[];
    const t = data as CaPeopleSearchResponse;
    const legacy = ([] as CaPerson[])
      .concat(t.itens ?? [])
      .concat((t.items as CaPerson[]) ?? [])
      .map((row) => row as unknown as Record<string, unknown>);
    return legacy.filter(isRecord);
  };

  const seenIds = new Set<string>();
  const out: Array<{ id: string; nome: string; documento?: string | null }> = [];

  for (const qText of queryCandidates) {
    if (qText.length < 2 && !/^\d{11,14}$/.test(qText)) continue;

    for (const p of paramBundlesForTerm(qText.trim())) {
      const qs = new URLSearchParams(p);
      try {
        const path = `/v1/pessoas?${qs.toString()}`;
        const data = await caFetch<unknown>(path, accessToken);
        const rows = extractRowsFlat(data)
          .filter((raw) => caPessoaRowIsActiveCliente(raw))
          .map(normalizeCaPersonBrief)
          .filter((x): x is NonNullable<typeof x> => Boolean(x));

        if (!rows.length) continue;

        for (const row of rows) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);
          out.push(row);
          if (out.length >= 35) return out;
        }

        /** Já há resultados com este termo em alguma estratégia válida → não precisa brigar outros params */
        break;
      } catch {
        /* tenta próxima estratégia */
      }
    }

    /** Se já há um volume razoável, para de aumentar falsos positivos nos variantes truncados */
    if (out.length >= 14) break;
  }

  return out;
}

export function cobrancaFaturamentoBlock(raw: unknown): Record<string, unknown> | null {
  const o = asRecord(raw);
  if (!o) return null;
  return (
    (asRecord(o.contato_cobranca_faturamento) ??
      asRecord(o.contatoCobrancaFaturamento)) ||
    null
  );
}

/**
 * Extrai e-mails do contato de cobrança / faturamento (campos snakeCase e camelCase).
 */
export function billingEmailsFromPersonDetail(raw: unknown): string[] {
  const ccf = cobrancaFaturamentoBlock(raw);
  const out: string[] = [];
  if (!ccf) return out;

  const emailsUnknown =
    ccf.emails ??
    /** alguns payloads trazem letra maiúscula */
    ccf["Emails"];

  if (typeof emailsUnknown === "string" && emailsUnknown.trim()) {
    for (const e of emailsUnknown.split(/[,;]/)) {
      const x = e.trim();
      if (x) out.push(x);
    }
  } else if (Array.isArray(emailsUnknown)) {
    for (const e of emailsUnknown) {
      if (typeof e === "string" && e.trim()) out.push(e.trim());
      else if (isRecord(e)) {
        const one = str(e.email ?? e.endereco_email ?? e.enderecoEmail);
        if (one) out.push(one);
      }
    }
  }

  if (!out.length && typeof ccf.email === "string" && ccf.email.trim()) out.push(ccf.email.trim());

  return [...new Set(out)];
}

/**
 * Igual aos e-mails concatenados por `billingEmailsFromPersonDetail`, mas **sem** recurso ao
 * principal / outros contatos — para telas onde só faz sentido falar com cobrança e faturamento.
 */
export function billingEmailOnlyJoined(raw: unknown): string | null {
  const list = billingEmailsFromPersonDetail(raw);
  if (!list.length) return null;
  return list.join("; ");
}

/**
 * Lista usada quando precisamos de «cobrança/faturamento + geral»: primeiro contatos da CCF na Conta Azul,
 * depois e-mail principal e demais (`outros_contatos`), sempre sem repetir destinatários.
 */
export function cobrancaPlusPrincipalEmailsJoined(raw: unknown): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushBlock = (s: string | undefined) => {
    if (!s?.trim()) return;
    for (const addr of parseEmailAddresses(s.trim())) {
      const k = addr.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      ordered.push(addr);
    }
  };

  for (const e of billingEmailsFromPersonDetail(raw)) pushBlock(e);

  const o = asRecord(raw);
  if (o) {
    const main = str(o.email) ?? str(o.e_mail) ?? "";
    if (main) pushBlock(main.replace(/\s*,\s*/g, ";"));
    const outros = (o.outros_contatos ?? o.outrosContatos) as unknown;
    if (Array.isArray(outros)) {
      for (const oc of outros) {
        if (!isRecord(oc)) continue;
        const em = str(oc.email ?? oc.endereco_email ?? oc.enderecoEmail);
        if (em) pushBlock(em.replace(/\s*,\s*/g, ";"));
      }
    }
  }

  return ordered.join("; ");
}

export function billingEmailJoined(raw: unknown, fallbackMainEmail?: string | null): string | null {
  const list = billingEmailsFromPersonDetail(raw);
  if (list.length) return list.join("; ");

  const o = asRecord(raw);
  if (!o) return fallbackMainEmail?.trim() ?? null;

  const main = str(o.email) ?? str(o.e_mail) ?? "";

  if (main) return main.replace(/\s*,\s*/g, "; ");

  /** Outros contatos — primeiro e-mail válido */
  const outros = (o.outros_contatos ?? o.outrosContatos) as unknown;
  if (Array.isArray(outros)) {
    for (const oc of outros) {
      if (!isRecord(oc)) continue;
      const em = str(oc.email ?? oc.endereco_email ?? oc.enderecoEmail);
      if (em) return em.replace(/\s*,\s*/g, "; ");
    }
  }

  return fallbackMainEmail?.trim() ?? null;
}

export async function fetchPersonDetail(accessToken: string, id: string): Promise<unknown> {
  return caFetch<unknown>(`/v1/pessoas/${encodeURIComponent(id)}`, accessToken);
}
