import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { userHasRole } from "@/lib/auth/roles";
import { getValidAccessToken } from "@/lib/contaazul/session";

export async function requireFinanceiroCaSession() {
  const session = requirePortalSession(await getPortalSession());
  if (!userHasRole(session.roles, "cobranca")) {
    return { error: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  const token = await getValidAccessToken();
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: "conta_azul_disconnected" }, { status: 401 }) };
  }
  return { session, token };
}
