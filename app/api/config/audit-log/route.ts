import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { listPortalAuditLogs } from "@/lib/audit/portalAuditLog";

export async function GET(request: Request) {
  try {
    await requireMasterSession();

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "50");
    const userEmail = url.searchParams.get("userEmail") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const { rows, total } = await listPortalAuditLogs({
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      userEmail,
      search,
    });

    return NextResponse.json({
      logs: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: Math.max(1, page),
      pageSize: Math.min(100, Math.max(1, pageSize)),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/audit-log GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
