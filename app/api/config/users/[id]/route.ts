import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { updatePortalUser } from "@/lib/config/portalUserService";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireMasterSession();
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      email?: string;
      displayName?: string;
      jobTitle?: string;
      profileId?: string;
      active?: boolean;
      password?: string;
      resetTotp?: boolean;
      tagIniciais?: string;
      tagCor?: string;
    };
    const result = await updatePortalUser(id, body);
    return NextResponse.json({
      user: {
        ...result.user,
        lastLoginAt: result.user.lastLoginAt?.toISOString() ?? null,
        updatedAt: result.user.updatedAt.toISOString(),
      },
      totpSecret: result.totpSecret,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "email_exists" || msg === "email_invalid") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[config/users PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
