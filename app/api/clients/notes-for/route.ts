import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_IDS = 500;

/**
 * POST { clientIds: string[] } → { byId: Record<clientId, note> }
 * Separado da rota receivables para não acumular Prisma + Conta Azul no mesmo timeout.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const raw = (body as { clientIds?: unknown })?.clientIds;
  const ids = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  const unique = [...new Set(ids)].slice(0, MAX_IDS);
  if (unique.length === 0) {
    return NextResponse.json({ byId: {} as Record<string, string> });
  }

  try {
    await prisma.clientPortalMeta.deleteMany({
      where: { clientId: { notIn: unique } },
    });
    const rows = await prisma.clientPortalMeta.findMany({
      where: { clientId: { in: unique } },
      select: { clientId: true, note: true },
    });
    const byId: Record<string, string> = {};
    for (const r of rows) {
      byId[r.clientId] = r.note ?? "";
    }
    return NextResponse.json({ byId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "db_error";
    return NextResponse.json({ error: msg, byId: {} }, { status: 500 });
  }
}
