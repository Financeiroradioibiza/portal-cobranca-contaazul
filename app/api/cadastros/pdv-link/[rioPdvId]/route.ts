import { NextResponse } from "next/server";
import { deletePainelPdvLink } from "@/lib/cadastros/painelPdvLinkService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvId: string }> };

export async function DELETE(_req: Request, context: Ctx) {
  const { rioPdvId } = await context.params;
  if (!rioPdvId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await deletePainelPdvLink(rioPdvId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
