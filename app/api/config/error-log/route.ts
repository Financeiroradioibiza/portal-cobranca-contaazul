import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import {
  clearPortalErrorLogs,
  listPortalErrorLogs,
  type PortalErrorLogRow,
} from "@/lib/audit/portalErrorLog";

function toCsvCell(v: unknown): string {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: PortalErrorLogRow[]): string {
  const header = [
    "createdAt",
    "level",
    "source",
    "status",
    "method",
    "path",
    "userEmail",
    "message",
    "stack",
    "context",
    "userAgent",
  ];
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      r.level,
      r.source,
      r.status ?? "",
      r.method,
      r.path,
      r.userEmail,
      r.message,
      r.stack,
      r.context,
      r.userAgent,
    ]
      .map(toCsvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

export async function GET(request: Request) {
  try {
    await requireMasterSession();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "100");
    const level = url.searchParams.get("level") ?? undefined;
    const source = url.searchParams.get("source") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const { rows, total } = await listPortalErrorLogs({
      page: Number.isFinite(page) ? page : 1,
      pageSize: format === "csv" ? 500 : Number.isFinite(pageSize) ? pageSize : 100,
      level,
      source,
      search,
    });

    if (format === "csv") {
      const csv = rowsToCsv(rows);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="portal-erros-${stamp}.csv"`,
        },
      });
    }

    return NextResponse.json({
      logs: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/error-log GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireMasterSession();
    const url = new URL(request.url);
    const beforeId = url.searchParams.get("beforeId") ?? undefined;
    const deleted = await clearPortalErrorLogs(beforeId);
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/error-log DELETE]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
