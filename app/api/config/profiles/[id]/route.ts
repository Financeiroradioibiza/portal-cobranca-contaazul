import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { listPortalProfiles, updatePortalProfilePermissions } from "@/lib/config/portalUserService";

export async function GET() {
  try {
    await requireMasterSession();
    const profiles = await listPortalProfiles();
    return NextResponse.json({ profiles });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/profiles GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireMasterSession();
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      permissionsJson?: string;
      rolesJson?: string;
    };
    if (!body.permissionsJson || !body.rolesJson) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    await updatePortalProfilePermissions(id, body.permissionsJson, body.rolesJson);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/profiles PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
