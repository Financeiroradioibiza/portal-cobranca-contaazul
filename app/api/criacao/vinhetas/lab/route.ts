import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { normalizePortalEmail } from "@/lib/auth/users";
import { createVinhetaLabDraft, listVinhetasLab } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const scope = new URL(request.url).searchParams.get("scope");
    const rows = await listVinhetasLab({
      sessionEmail: normalizePortalEmail(session.email),
      status: scope === "biblioteca" ? "aprovada" : "all",
    });
    return NextResponse.json({ ok: true, vinhetas: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const body = (await request.json().catch(() => ({}))) as {
      nome?: string;
      texto?: string;
      voz?: string;
      vozNome?: string;
      trilhaMusicaId?: string;
      trilhaVinhetaId?: string;
    };
    const row = await createVinhetaLabDraft({
      nome: body.nome ?? "",
      texto: body.texto ?? "",
      voz: body.voz ?? "",
      vozNome: body.vozNome ?? "",
      trilhaMusicaId: body.trilhaMusicaId ?? null,
      trilhaVinhetaId: body.trilhaVinhetaId ?? null,
      criativoUserId: normalizePortalEmail(session.email),
      criativoNome: session.displayName ?? session.email,
    });
    return NextResponse.json({ ok: true, vinheta: row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "nome_obrigatorio") return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
