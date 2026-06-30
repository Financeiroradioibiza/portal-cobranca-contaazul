import { NextResponse } from "next/server";
import {
  getPortalSession,
  requirePortalSession,
  requireVinhetaConfigSession,
} from "@/lib/auth/portalAccess";
import {
  elevenLabsEnabledGlobally,
  resolveElevenLabsApiKey,
} from "@/lib/criacao/elevenLabsService";
import { isVinhetaConfigAdmin } from "@/lib/criacao/vinhetaConfigAccess";
import {
  getVinhetaCatalogPayload,
  saveVinhetaPresets,
  type VinhetaPresetTrilha,
  type VinhetaPresetVoice,
} from "@/lib/criacao/vinhetaPresetsService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = requirePortalSession(await getPortalSession());
    const key = await resolveElevenLabsApiKey(session.email);
    const global = elevenLabsEnabledGlobally();
    const catalog = await getVinhetaCatalogPayload();
    return NextResponse.json({
      ...catalog,
      elevenLabs: {
        configured: Boolean(key),
        source: global ? "server" : key ? "user" : "none",
        globalFallback: global,
      },
      canEdit: isVinhetaConfigAdmin(session),
      vinhetaConfigAdmin: isVinhetaConfigAdmin(session),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireVinhetaConfigSession();
    const body = (await request.json().catch(() => ({}))) as {
      voices?: VinhetaPresetVoice[];
      trilhas?: VinhetaPresetTrilha[];
    };
    const voices = Array.isArray(body.voices) ? body.voices : [];
    const trilhas = Array.isArray(body.trilhas) ? body.trilhas : [];
    await saveVinhetaPresets({ voices, trilhas, updatedBy: session.email });
    const catalog = await getVinhetaCatalogPayload();
    return NextResponse.json({ ok: true, ...catalog });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
