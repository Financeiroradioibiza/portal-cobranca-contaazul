import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { recordPortalAuditLog } from "@/lib/audit/portalAuditLog";

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());

    let body: {
      path?: string;
      method?: string;
      query?: string;
      ip?: string;
      userAgent?: string;
      actionOverride?: string;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const path = body.path?.trim();
    const method = body.method?.trim();
    if (!path || !method) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    await recordPortalAuditLog({
      userEmail: session.email,
      userDisplayName: session.displayName,
      method,
      path,
      query: body.query,
      ip: body.ip,
      userAgent: body.userAgent,
      actionOverride: body.actionOverride,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    // Auditoria é best-effort — falha de DB não deve virar 500 no Netlify.
    console.error("[internal/audit-log POST]", e);
    return NextResponse.json({ ok: false, skipped: "audit_write_failed" });
  }
}
