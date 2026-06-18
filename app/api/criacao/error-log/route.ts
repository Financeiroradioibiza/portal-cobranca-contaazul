import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { listPortalErrorLogs } from "@/lib/audit/portalErrorLog";

export const runtime = "nodejs";

/** GET /api/criacao/error-log — erros recentes do módulo Criação (qualquer usuário logado). */
export async function GET(request: Request) {
  try {
    requirePortalSession(await getPortalSession());

    const url = new URL(request.url);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "30")));
    const scope = url.searchParams.get("scope") ?? "criacao";
    const search = url.searchParams.get("search")?.trim();

    const { rows, total } = await listPortalErrorLogs({
      page: 1,
      pageSize,
      level: url.searchParams.get("level") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      search: scope === "all" ? search : search || "criacao",
    });

    // Refina: scope criacao = path contém criacao (search "criacao" pega path e mensagens)
    const logs =
      scope === "all"
        ? rows
        : rows.filter(
            (r) =>
              r.path.includes("/criacao") ||
              r.path.includes("/api/criacao") ||
              r.message.toLowerCase().includes("criacao") ||
              r.message.toLowerCase().includes("cloud2"),
          );

    return NextResponse.json({
      logs: logs.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: scope === "all" ? total : logs.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[criacao/error-log GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
