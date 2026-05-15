import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  PORTAL_SESSION_COOKIE,
  portalSessionCookieOptions,
  signPortalSession,
} from "@/lib/auth/sessionToken";
import { verifyTotp } from "@/lib/auth/totp";
import {
  findPortalUser,
  isPortalAuthConfigured,
  isPortalAuthDisabled,
} from "@/lib/auth/users";

export async function POST(request: Request) {
  if (isPortalAuthDisabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  if (!isPortalAuthConfigured()) {
    return NextResponse.json(
      { error: "auth_not_configured" },
      { status: 503 },
    );
  }

  let body: { username?: string; password?: string; totp?: string };
  try {
    body = (await request.json()) as {
      username?: string;
      password?: string;
      totp?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  const totp = body.totp?.trim() ?? "";

  if (!username || !password || !totp) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const user = findPortalUser(username);
  if (!user) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const passOk = await bcrypt.compare(password, user.passwordHash).catch(() => false);
  if (!passOk) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (!verifyTotp(user.totpSecret, totp)) {
    return NextResponse.json({ error: "invalid_totp" }, { status: 401 });
  }

  const token = await signPortalSession(user.username);
  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, token, portalSessionCookieOptions());

  return NextResponse.json({ ok: true });
}
