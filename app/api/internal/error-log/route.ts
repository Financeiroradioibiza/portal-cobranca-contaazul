import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/auth/portalAccess";
import { recordPortalErrorLog } from "@/lib/audit/portalErrorLog";

/** Recebe erros capturados no client (window.onerror, unhandledrejection, fetch, error boundary). */
export async function POST(request: Request) {
  try {
    const session = await getPortalSession();

    let body: {
      level?: string;
      source?: string;
      message?: string;
      stack?: string;
      path?: string;
      method?: string;
      status?: number;
      context?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    if (!body.message || !String(body.message).trim()) {
      return NextResponse.json({ error: "missing_message" }, { status: 400 });
    }

    await recordPortalErrorLog({
      level: body.level as never,
      source: (body.source as never) ?? "client",
      message: String(body.message),
      stack: body.stack,
      path: body.path,
      method: body.method,
      status: typeof body.status === "number" ? body.status : null,
      userEmail: session?.email ?? "",
      userAgent: request.headers.get("user-agent") ?? "",
      context: body.context,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[internal/error-log POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
