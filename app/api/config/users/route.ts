import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import {
  computeUserStats,
  listPortalProfiles,
  listPortalUsers,
} from "@/lib/config/portalUserService";

export async function GET() {
  try {
    await requireMasterSession();
    const [users, profiles] = await Promise.all([listPortalUsers(), listPortalProfiles()]);
    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      profiles,
      stats: computeUserStats(users),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/users GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireMasterSession();
    const body = (await request.json()) as {
      email?: string;
      displayName?: string;
      jobTitle?: string;
      profileId?: string;
      password?: string;
    };
    const { createPortalUser } = await import("@/lib/config/portalUserService");
    const result = await createPortalUser({
      email: body.email ?? "",
      displayName: body.displayName ?? "",
      jobTitle: body.jobTitle ?? "",
      profileId: body.profileId ?? "",
      password: body.password ?? "",
    });
    return NextResponse.json({
      user: {
        ...result.user,
        lastLoginAt: result.user.lastLoginAt?.toISOString() ?? null,
      },
      totpSecret: result.totpSecret,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "invalid_email" || msg === "email_exists" || msg === "profile_not_found") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[config/users POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
