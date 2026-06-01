import { NextResponse } from "next/server";
import { fetchActiveContractNumbersByClientIds } from "@/lib/contaazul/contracts";
import { getValidAccessToken } from "@/lib/contaazul/session";
import {
  CONTRACTS_REFRESH_BATCH_SIZE,
  persistClientContractsBatch,
  trimContractNumbersText,
} from "@/lib/clientPortalContracts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TOTAL_IDS = 2000;

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

  const rawIds = (body as { clientIds?: unknown })?.clientIds;
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];

  const offsetRaw = (body as { offset?: unknown })?.offset;
  const offset = Math.max(0, Number(offsetRaw) || 0);

  const unique = [...new Set(ids)].slice(0, MAX_TOTAL_IDS);
  const total = unique.length;

  if (total === 0) {
    return NextResponse.json({
      byClientId: {} as Record<string, string>,
      nextOffset: 0,
      total: 0,
      done: true,
      batchSize: CONTRACTS_REFRESH_BATCH_SIZE,
    });
  }

  const slice = unique.slice(offset, offset + CONTRACTS_REFRESH_BATCH_SIZE);
  if (slice.length === 0) {
    return NextResponse.json({
      byClientId: {} as Record<string, string>,
      nextOffset: offset,
      total,
      done: true,
      batchSize: CONTRACTS_REFRESH_BATCH_SIZE,
    });
  }

  try {
    const map = await fetchActiveContractNumbersByClientIds(token, slice, {
      includeTodosSupplement: false,
      clientConcurrency: 4,
    });

    const persistMap = new Map<string, string>();
    const byClientId: Record<string, string> = {};
    for (const id of slice) {
      const text = trimContractNumbersText(map.get(id) ?? "");
      persistMap.set(id, text);
      byClientId[id] = text;
    }
    await persistClientContractsBatch(persistMap);

    const nextOffset = offset + slice.length;
    return NextResponse.json({
      byClientId,
      nextOffset,
      total,
      done: nextOffset >= total,
      batchSize: CONTRACTS_REFRESH_BATCH_SIZE,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "contract_fetch_error";
    return NextResponse.json(
      {
        error: msg,
        byClientId: {} as Record<string, string>,
        nextOffset: offset,
        total,
        done: false,
        batchSize: CONTRACTS_REFRESH_BATCH_SIZE,
      },
      { status: 502 },
    );
  }
}
