import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { refreshProducaoSuporteEspelhoPdvTelemetry } from "@/lib/cadastros/producaoSuporteEspelhoService";
import { cloud2Enabled } from "@/lib/criacao/cloud2Client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvKey: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    if (!userHasRole(session.roles, "suporte") && !userHasRole(session.roles, "master")) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { rioPdvKey: raw } = await ctx.params;
    const rioPdvKey = decodeURIComponent(raw ?? "").trim();
    if (!rioPdvKey) return NextResponse.json({ error: "invalid_key" }, { status: 400 });

    if (!cloud2Enabled()) {
      return NextResponse.json({ ok: false, error: "cloud2_desabilitado" }, { status: 503 });
    }

    const result = await refreshProducaoSuporteEspelhoPdvTelemetry(rioPdvKey);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    if (msg === "pdv_sem_portal_id") {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    console.error("[suporte/telemetria POST]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
