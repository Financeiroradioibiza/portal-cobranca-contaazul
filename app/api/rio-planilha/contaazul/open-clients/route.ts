import { NextResponse } from "next/server";
import { buildRioOpenBalanceClients } from "@/lib/contaazul/aggregate";
import { fetchAllReceivableInstallments, fetchPeopleByIds } from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { defaultPeriodMonths } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lista clientes CA com parcela em **aberto** (nao_pago > 0), no intervalo de vencimento.
 * Usado para pré-preencher a Planilha Rio (faixa “ativos”).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let start = searchParams.get("start") ?? "";
  let end = searchParams.get("end") ?? "";
  const months = Math.min(36, Math.max(1, Number(searchParams.get("months") ?? "12") || 12));
  if (!start || !end) {
    const p = defaultPeriodMonths(months);
    start = p.start;
    end = p.end;
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "not_connected", clients: [] }, { status: 401 });
  }

  try {
    const items = await fetchAllReceivableInstallments(token, start, end);
    const clientIds = [
      ...new Set(
        items
          .filter((i) => typeof i.nao_pago === "number" && i.nao_pago > 0)
          .map((i) => i.cliente?.id)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const people = await fetchPeopleByIds(token, clientIds);
    const clients = buildRioOpenBalanceClients(items, people);
    return NextResponse.json({
      clients,
      period: { start, end },
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_error";
    return NextResponse.json({ error: msg, clients: [] }, { status: 502 });
  }
}
