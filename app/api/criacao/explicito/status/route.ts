import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { geniusEnabled } from "@/lib/criacao/geniusLyricsService";

/** Status leve do Genius — sem contagem de faixas (evita timeout falso "desabilitado"). */
export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    return NextResponse.json({ geniusEnabled: geniusEnabled() });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/explicito/status GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
