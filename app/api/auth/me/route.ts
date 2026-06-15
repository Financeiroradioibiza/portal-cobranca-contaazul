import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/auth/portalAccess";

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    email: session.email,
    displayName: session.displayName ?? session.email,
    roles: session.roles,
    isMaster: session.roles.includes("master"),
  });
}
