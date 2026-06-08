import { NextResponse } from "next/server";
import { suggestForRioPdv } from "@/lib/cadastros/painelPdvLinkService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rioCompPdvId =
    typeof body.rioCompPdvId === "string" ? body.rioCompPdvId.trim() : "";
  if (!rioCompPdvId) {
    return NextResponse.json({ error: "rio_comp_pdv_id_obrigatorio" }, { status: 400 });
  }

  try {
    const result = await suggestForRioPdv(rioCompPdvId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    const status = msg === "rio_pdv_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
