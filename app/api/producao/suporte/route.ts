import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { getProducaoSuporte } from "@/lib/cadastros/producaoSuporteService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const canRegenerarToken =
      userHasRole(session.roles, "suporte") || userHasRole(session.roles, "master");
    const payload = await getProducaoSuporte({ canRegenerarToken });
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
