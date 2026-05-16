import { CONTA_AZUL_API_BASE } from "./config";

/**
 * Lista contratos ATIVOS por cliente (GET /v1/contratos).
 * Exige intervalo de datas na API; usamos janela larga para não perder contratos antigos.
 */
export async function fetchActiveContractNumbersByClientIds(
  accessToken: string,
  clientIds: string[],
): Promise<Map<string, string>> {
  const want = new Set(clientIds.filter(Boolean));
  if (want.size === 0) return new Map();

  type Row = {
    status?: string;
    numero?: number | string;
    cliente?: { id?: string };
    cliente_id?: string;
    clienteId?: string;
    id?: string;
  };

  const acc = new Map<string, Set<string>>();

  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 12);
  const data_inicio = start.toISOString().slice(0, 10);
  const data_fim = new Date(end.getTime() + 86400000 * 800).toISOString().slice(0, 10);

  let pagina = 1;
  for (;;) {
    const qs = new URLSearchParams({
      data_inicio,
      data_fim,
      pagina: String(pagina),
      tamanho_pagina: "50",
    });

    const url = `${CONTA_AZUL_API_BASE}/v1/contratos?${qs}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        "[contracts] GET /v1/contratos",
        res.status,
        (await res.text().catch(() => "")).slice(0, 400),
      );
      break;
    }

    const data = (await res.json()) as { items?: Row[]; itens?: Row[] };
    const items = data.items ?? data.itens ?? [];

    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Row;
      const status = String(r.status ?? "").toUpperCase();
      if (status !== "ATIVO") continue;

      const cid =
        r.cliente?.id ?? r.cliente_id ?? r.clienteId ?? "";
      if (!cid || !want.has(cid)) continue;

      const num =
        r.numero != null && r.numero !== ""
          ? String(r.numero)
          : r.id
            ? `ref-${String(r.id).slice(0, 8)}`
            : null;

      if (!num) continue;
      if (!acc.has(cid)) acc.set(cid, new Set());
      acc.get(cid)!.add(num);
    }

    if (items.length < 50) break;
    pagina += 1;
    if (pagina > 80) break;
  }

  const out = new Map<string, string>();
  for (const [cid, set] of acc) {
    out.set(cid, [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(", "));
  }
  return out;
}
