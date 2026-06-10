import type { PainelMatchMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { upsertPainelPdvLinksBulk } from "@/lib/cadastros/painelPdvLinkService";
import { BULK_BATCH_SIZE } from "@/lib/cadastros/painelMatch";

export const runtime = "nodejs";
export const maxDuration = 120;

const METHODS = new Set<PainelMatchMethod>([
  "cnpj",
  "nome_pdv",
  "nome_cliente",
  "manual",
]);

function parsePainelId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawLinks = body.links;
  if (!Array.isArray(rawLinks)) {
    return NextResponse.json({ error: "links_obrigatorio" }, { status: 400 });
  }
  if (rawLinks.length === 0) {
    return NextResponse.json({ ok: true, linked: 0, cadastroImported: 0, failed: [] });
  }
  if (rawLinks.length > BULK_BATCH_SIZE) {
    return NextResponse.json({ error: "batch_limit_10" }, { status: 400 });
  }

  const links: Array<{
    rioCompPdvId: string;
    painelPdvId: number;
    painelClienteId: number;
    matchMethod: PainelMatchMethod;
  }> = [];

  for (const raw of rawLinks) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const rioCompPdvId =
      typeof row.rioCompPdvId === "string" ? row.rioCompPdvId.trim() : "";
    const painelPdvId = parsePainelId(row.painelPdvId);
    const painelClienteId = parsePainelId(row.painelClienteId);
    if (!rioCompPdvId || painelPdvId == null || painelClienteId == null) continue;

    let matchMethod: PainelMatchMethod = "manual";
    if (
      typeof row.matchMethod === "string"
      && METHODS.has(row.matchMethod as PainelMatchMethod)
    ) {
      matchMethod = row.matchMethod as PainelMatchMethod;
    }

    links.push({ rioCompPdvId, painelPdvId, painelClienteId, matchMethod });
  }

  if (links.length === 0) {
    return NextResponse.json({ error: "links_invalidos" }, { status: 400 });
  }

  try {
    const result = await upsertPainelPdvLinksBulk(links);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    const status = msg === "batch_limit_10" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
