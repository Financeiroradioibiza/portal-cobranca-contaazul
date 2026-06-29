import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getAtlCricaBoard } from "@/lib/criacao/atlCricaService";
import { parseCompetencia } from "@/lib/criacao/competencia";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const competencia = parseCompetencia(new URL(request.url).searchParams.get("competencia"));
    const isAdmin = session.roles.includes("master");
    const payload = await getAtlCricaBoard({
      competencia,
      sessionEmail: session.email,
      isAdmin,
    });
    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/atl-crica GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
