import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listMigracaoClientes } from "@/lib/suporte/migracaoService";

export const runtime = "nodejs";

export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const result = await listMigracaoClientes();
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "falhou" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      rows: result.rows,
      cloud2Ok: result.cloud2Ok,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/migracao GET]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
