import { after, NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { getProducaoSuporte } from "@/lib/cadastros/producaoSuporteService";
import { rebuildProducaoSuporteEspelho } from "@/lib/cadastros/producaoSuporteEspelhoService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const canRegenerarToken =
      userHasRole(session.roles, "suporte") || userHasRole(session.roles, "master");

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const filter = url.searchParams.get("filter");
    const clienteKey = url.searchParams.get("clienteKey")?.trim() ?? "";
    const rebuild = url.searchParams.get("rebuild") === "1";
    const forceLive =
      url.searchParams.get("live") === "1" &&
      (userHasRole(session.roles, "suporte") || userHasRole(session.roles, "master"));

    const listFilter =
      filter === "sem_ping" ? "sem_ping"
      : filter === "instalados" ? "instalados"
      : filter === "sem_primeiro_ping" ? "sem_primeiro_ping"
      : undefined;

    const payload = await getProducaoSuporte({
      canRegenerarToken,
      searchQuery: q || undefined,
      listFilter,
      clienteKey: clienteKey || undefined,
      forceRebuild: rebuild,
      forceLive,
    });

    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Rebuild completo do espelho (master/suporte). */
export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!userHasRole(session.roles, "suporte") && !userHasRole(session.roles, "master")) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    let body: { action?: string } = {};
    try {
      body = (await request.json()) as { action?: string };
    } catch {
      body = {};
    }

    if (body.action === "rebuild_espelho") {
      after(async () => {
        try {
          await rebuildProducaoSuporteEspelho();
        } catch (e) {
          console.error("[suporte/rebuild_espelho]", e);
        }
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
