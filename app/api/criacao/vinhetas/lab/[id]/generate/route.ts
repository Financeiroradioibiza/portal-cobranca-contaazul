import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { normalizePortalEmail } from "@/lib/auth/users";
import { generateVinhetaLab } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const row = await generateVinhetaLab(id, normalizePortalEmail(session.email));
    return NextResponse.json({ ok: true, vinheta: row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    const known = [
      "vinheta_nao_encontrada",
      "texto_obrigatorio",
      "voz_obrigatoria",
      "trilha_obrigatoria",
      "elevenlabs_nao_configurado",
    ];
    if (known.includes(msg) || msg.startsWith("elevenlabs_") || msg.startsWith("mix_falhou")) {
      return NextResponse.json({ error: msg }, { status: msg.includes("nao_encontrada") ? 404 : 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
