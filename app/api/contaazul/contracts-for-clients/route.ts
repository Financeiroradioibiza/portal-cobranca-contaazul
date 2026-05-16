import { NextResponse } from "next/server";
import { fetchActiveContractNumbersByClientIds } from "@/lib/contaazul/contracts";
import { getValidAccessToken } from "@/lib/contaazul/session";

/** Edge/Netlify: esta rota fica mais enxuta que misturar com receivables. */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IDS = 400;

export async function POST(request: Request) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

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
    return NextResponse.json({ byClientId: {} as Record<string, string> });
  }

  try {
    const map = await fetchActiveContractNumbersByClientIds(token, unique);
    const byClientId: Record<string, string> = {};
    for (const [k, v] of map) {
      byClientId[k] = v;
    }
    return NextResponse.json({ byClientId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "contract_fetch_error";
    return NextResponse.json({ error: msg, byClientId: {} }, { status: 502 });
  }
}
