import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { normalizePortalEmail } from "@/lib/auth/users";
import { tweakAndRegenerateVinhetaLab, type VinhetaLabTweakAction } from "@/lib/criacao/vinhetaLabService";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS: VinhetaLabTweakAction[] = [
  "bed_lower",
  "speed_down",
  "stability_more",
  "stability_less",
];

export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = requirePortalSession(await getPortalSession());
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: VinhetaLabTweakAction;
      nome?: string;
      texto?: string;
      voz?: string;
      vozNome?: string;
      trilhaVinhetaId?: string | null;
    };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: "acao_invalida" }, { status: 400 });
    }
    const row = await tweakAndRegenerateVinhetaLab(id, normalizePortalEmail(session.email), body.action, {
      nome: body.nome,
      texto: body.texto,
      voz: body.voz,
      vozNome: body.vozNome,
      trilhaVinhetaId: body.trilhaVinhetaId,
    });
    return NextResponse.json({ ok: true, vinheta: row });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "server_error";
    const known = [
      "vinheta_nao_encontrada",
      "vinheta_ja_aprovada",
      "texto_obrigatorio",
      "voz_obrigatoria",
      "trilha_obrigatoria",
      "elevenlabs_nao_configurado",
      "nada_para_atualizar",
    ];
    if (known.includes(msg) || msg.startsWith("elevenlabs_") || msg.startsWith("mix_falhou")) {
      return NextResponse.json({ error: msg }, { status: msg.includes("nao_encontrada") ? 404 : 400 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
