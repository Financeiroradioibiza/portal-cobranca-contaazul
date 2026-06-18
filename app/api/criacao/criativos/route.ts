import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listCriativosForTag } from "@/lib/criacao/criativoUserService";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const criativos = await listCriativosForTag();
    return NextResponse.json({ criativos, currentUserEmail: session.email });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/criativos GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
