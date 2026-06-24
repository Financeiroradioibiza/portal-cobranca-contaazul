import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** IDs de clientes com login Player ativo no portal (para estado na produção). */
export async function GET() {
  try {
    requirePortalSession(await getPortalSession());
    const rows = await prisma.clientePlayerLogin.findMany({
      where: { active: true },
      select: { portalClienteId: true },
    });
    return NextResponse.json({
      ok: true,
      portalClienteIds: rows.map((r) => r.portalClienteId),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[player/portal-ids/player-logins GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
