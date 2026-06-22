import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listPrimeiroPingRows } from "@/lib/cadastros/primeiroPingService";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const result = await listPrimeiroPingRows();
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "cloud2_indisponivel" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, rows: result.rows });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[cadastros/primeiro-ping GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
