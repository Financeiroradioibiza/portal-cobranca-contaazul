import { NextResponse } from "next/server";
import { resolvePortalSessionForApi } from "@/lib/auth/portalSessionFromRequest";
import { getPortalMenuPermissionsForEmail } from "@/lib/config/portalUserPermissions";
import { isFluxoRafaelAdmin } from "@/lib/financeiro/fluxoRafaelAccess";

export async function GET(request: Request) {
  const session = await resolvePortalSessionForApi(request);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let menuPermissions: Awaited<ReturnType<typeof getPortalMenuPermissionsForEmail>> = {};
  try {
    menuPermissions = await getPortalMenuPermissionsForEmail(session.email);
  } catch (e) {
    console.error("[auth/me menuPermissions]", session.email, e);
  }
  return NextResponse.json({
    email: session.email,
    displayName: session.displayName ?? session.email,
    roles: session.roles,
    isMaster: session.roles.includes("master"),
    fluxoRafaelAdmin: isFluxoRafaelAdmin(session),
    menuPermissions,
  });
}
