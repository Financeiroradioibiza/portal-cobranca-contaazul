import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { updatePortalUser } from "@/lib/config/portalUserService";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireMasterSession();
    const { id } = await ctx.params;
    const body = (await request.json()) as {
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
      },
      totpSecret: result.totpSecret,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/users PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
