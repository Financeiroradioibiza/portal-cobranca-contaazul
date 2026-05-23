import { caFetch } from "./caHttp";
import type { CaPeopleSearchResponse, CaPerson } from "./types";

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
}

/**
 * Extrai e-mails do contato de cobrança / faturamento (Conta Azul: `contato_cobranca_faturamento.emails`).
 */
export function billingEmailsFromPersonDetail(raw: unknown): string[] {
  const obj = asRecord(raw);
  if (!obj) return [];

  const ccf = asRecord(obj.contato_cobranca_faturamento);
  const emailsUnknown = ccf?.emails;
  const out: string[] = [];

  if (Array.isArray(emailsUnknown)) {
    for (const e of emailsUnknown) {
      if (typeof e === "string" && e.trim()) out.push(e.trim());
    }
  }

  /** Alguns payloads podem trazer objeto com `email`. */
  if (!out.length && ccf && typeof (ccf as { email?: unknown }).email === "string") {
    const one = ((ccf as { email: string }).email || "").trim();
    if (one) out.push(one);
  }

  return [...new Set(out)];
}

export function billingEmailJoined(raw: unknown, fallbackMainEmail?: string | null): string | null {
  const list = billingEmailsFromPersonDetail(raw);
  if (list.length) return list.join("; ");
  const main =
    typeof (asRecord(raw) as { email?: unknown } | null)?.email === "string"
      ? String((raw as { email?: string }).email || "").trim()
      : "";
  if (main) {
    /** Campo principal costuma aceitar vários separados por vírgula — normaliza vírgulas. */
    return main.replace(/\s*,\s*/g, "; ");
  }
  return fallbackMainEmail?.trim() || null;
}

/** Busca rápida em `/v1/pessoas?busca=…` para vincular cliente na UI. */
export async function searchPeopleByText(
  accessToken: string,
  busca: string,
): Promise<Array<{ id: string; nome: string; documento?: string | null }>> {
  const q = busca.trim();
  if (!q) return [];

  const qs = new URLSearchParams();
  qs.set("pagina", "1");
  qs.set("tamanho_pagina", "25");
  qs.set("busca", q);

  const path = `/v1/pessoas?${qs.toString()}`;
  const data = await caFetch<CaPeopleSearchResponse>(path, accessToken);
  const items = (data.itens ?? data.items ?? []) as CaPerson[];
  const out: Array<{ id: string; nome: string; documento?: string | null }> = [];
  for (const p of items) {
    if (p?.id && p.nome) {
      out.push({ id: p.id, nome: p.nome, documento: p.documento ?? null });
    }
  }
  return out;
}

export async function fetchPersonDetail(accessToken: string, id: string): Promise<unknown> {
  return caFetch<unknown>(`/v1/pessoas/${encodeURIComponent(id)}`, accessToken);
}
