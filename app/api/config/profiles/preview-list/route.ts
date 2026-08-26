import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { listPortalProfiles } from "@/lib/config/portalUserService";

/** Lista perfis para «visualizar como» (master). */
export async function GET() {
  try {
    await requireMasterSession();
    const profiles = await listPortalProfiles();
    return NextResponse.json({
      profiles: profiles.map((p) => ({
        slug: p.slug,
        name: p.name,
        icon: p.icon,
        permissionsJson: p.permissionsJson,
      })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/profiles/preview-list GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
