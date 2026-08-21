import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import {
  getProducaoSuporte,
  getProducaoSuporteOverview,
} from "@/lib/cadastros/producaoSuporteService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const canRegenerarToken =
      userHasRole(session.roles, "suporte") || userHasRole(session.roles, "master");

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const q = url.searchParams.get("q")?.trim() ?? "";
    const filter = url.searchParams.get("filter");
    const clienteKey = url.searchParams.get("clienteKey")?.trim() ?? "";

    const wantsList =
      mode === "list" ||
      q.length >= 2 ||
      filter === "sem_ping" ||
      Boolean(clienteKey);

    if (!wantsList) {
      const payload = await getProducaoSuporteOverview({ canRegenerarToken });
      return NextResponse.json({ ok: true, ...payload });
    }

    const payload = await getProducaoSuporte({
      canRegenerarToken,
      searchQuery: q || undefined,
      listFilter: filter === "sem_ping" ? "sem_ping" : undefined,
      clienteKey: clienteKey || undefined,
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
