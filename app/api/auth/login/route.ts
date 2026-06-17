import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  PORTAL_SESSION_COOKIE,
  portalSessionCookieOptions,
  signPortalSession,
} from "@/lib/auth/sessionToken";
import { verifyPortalTotp } from "@/lib/auth/totp";
import {
  findPortalUserForLogin,
  touchPortalUserLastLogin,
} from "@/lib/config/portalUserService";
import { recordPortalAuditLog } from "@/lib/audit/portalAuditLog";
import {
  isPortalAuthConfigured,
  isPortalAuthDisabled,
  normalizePortalEmail,
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

  let body: { email?: string; password?: string; totpCode?: string; username?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = normalizePortalEmail(body.email ?? body.username ?? "");
  const password = body.password ?? "";
  const totpCode = body.totpCode ?? "";

  if (!email || !password || !totpCode) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const user = await findPortalUserForLogin(email);
  if (!user) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const passOk = await bcrypt.compare(password, user.passwordHash).catch(() => false);
  if (!passOk) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (!verifyPortalTotp(totpCode, user.totpSecret)) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await touchPortalUserLastLogin(user.email);

  const token = await signPortalSession({
    email: user.email,
    roles: user.roles,
    displayName: user.displayName,
  });
  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, token, portalSessionCookieOptions());

  try {
    await recordPortalAuditLog({
      userEmail: user.email,
      userDisplayName: user.displayName,
      method: "POST",
      path: "/api/auth/login",
      actionOverride: "Entrou no portal",
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "",
      userAgent: request.headers.get("user-agent") ?? "",
    });
  } catch (e) {
    console.error("[auth/login audit]", e);
  }

  return NextResponse.json({ ok: true, email: user.email });
}
