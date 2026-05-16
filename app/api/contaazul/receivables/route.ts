import { NextResponse } from "next/server";
import { attachClientPortalMeta } from "@/lib/clientPortalMeta";
import { buildDashboardClients } from "@/lib/contaazul/aggregate";
import { fetchActiveContractNumbersByClientIds } from "@/lib/contaazul/contracts";
import {
  fetchAllReceivableInstallments,
  fetchPeopleByIds,
} from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { isPastDueOpen } from "@/lib/contaazul/types";
import { defaultPeriodMonths } from "@/lib/format";

/** Netlify/Vercel: tenta dar mais tempo para paginação Conta Azul + contratos. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let start = searchParams.get("start") ?? "";
  let end = searchParams.get("end") ?? "";
  if (!start || !end) {
    const p = defaultPeriodMonths(6);
    start = p.start;
    end = p.end;
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json(
      { error: "not_connected", clients: [] },
      { status: 401 },
    );
  }

  try {
    const items = await fetchAllReceivableInstallments(token, start, end);
    const clientIds = [
      ...new Set(
        items
          .filter(isPastDueOpen)
          .map((i) => i.cliente?.id)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const people = await fetchPeopleByIds(token, clientIds);
    const built = buildDashboardClients(items, people);

    let contractsByClient = new Map<string, string>();
    try {
      contractsByClient = await fetchActiveContractNumbersByClientIds(token, clientIds);
    } catch (err) {
      console.error("[receivables] contratos Conta Azul (ignorado para não bloquear listagem):", err);
    }

    const withContracts = built.map((c) => ({
      ...c,
      activeContractNumbers: contractsByClient.get(c.id) ?? null,
    }));
    const clients = await attachClientPortalMeta(withContracts);

    return NextResponse.json({
      clients,
      period: { start, end },
      fetchedAt: new Date().toISOString(),
      rawCount: items.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_error";
    return NextResponse.json(
      { error: msg, clients: [] },
      { status: 502 },
    );
  }
}
