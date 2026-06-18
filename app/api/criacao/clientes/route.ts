import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getProducaoDashboard } from "@/lib/cadastros/producaoDashboardService";
import { currentBrazilYearMonth } from "@/lib/manualReminders/yearMonth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

    const ym = currentBrazilYearMonth();
    const dash = await getProducaoDashboard(ym);

    let clientes = dash.clientes.map((c) => ({
      ref: c.key,
      nome: c.nome,
      pdvCount: c.pdvCount,
    }));

    if (q) {
      clientes = clientes.filter((c) => c.nome.toLowerCase().includes(q));
    }
    clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    return NextResponse.json({ clientes: clientes.slice(0, 500), yearMonth: ym });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/clientes GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
