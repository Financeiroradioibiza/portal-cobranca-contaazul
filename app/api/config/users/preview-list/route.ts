import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { listPortalProfiles, listPortalUsers } from "@/lib/config/portalUserService";
import { permissionsFromProfileJson } from "@/lib/portal/portalPreviewProfile";

/** Usuários ativos para «visualizar como» (master). */
export async function GET() {
  try {
    await requireMasterSession();
    const [users, profiles] = await Promise.all([listPortalUsers(), listPortalProfiles()]);
    const permBySlug = new Map(profiles.map((p) => [p.slug, p.permissionsJson]));
    return NextResponse.json({
      users: users
        .filter((u) => u.active)
        .map((u) => ({
          email: u.email,
          displayName: u.displayName.trim() || u.email,
          profileSlug: u.profile.slug,
          profileName: u.profile.name,
          profileIcon: u.profile.icon || "👤",
          permissions: permissionsFromProfileJson(permBySlug.get(u.profile.slug) ?? "{}"),
        })),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/users/preview-list GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
