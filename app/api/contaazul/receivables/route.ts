import { NextResponse } from "next/server";
import { buildDashboardClients } from "@/lib/contaazul/aggregate";
import {
  fetchAllReceivableInstallments,
  fetchPeopleByIds,
} from "@/lib/contaazul/receivables";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { isPastDueOpen } from "@/lib/contaazul/types";
import { defaultPeriodMonths } from "@/lib/format";

/** Sem edge: menos restrição de CPU/tempo que Edge em alguns hosts. */
export const runtime = "nodejs";
/** Contratos saem de POST /api/contaazul/contracts-for-clients para não estourar timeout. */
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
    const clients = buildDashboardClients(items, people);
    // Notas do portal: POST /api/clients/notes-for (paralelo no cliente, menos trabalho aqui).

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
