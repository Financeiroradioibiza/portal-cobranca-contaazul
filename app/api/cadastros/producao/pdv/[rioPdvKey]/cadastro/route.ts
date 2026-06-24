import { NextResponse, after } from "next/server";
import {
  getOrCreatePdvCadastro,
  updatePdvCadastro,
} from "@/lib/cadastros/producaoPdvCadastroService";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ rioPdvKey: string }> };

function scheduleGatewaySyncForPdv(rioPdvKey: string) {
  after(async () => {
    try {
      const { cloud2Enabled } = await import("@/lib/criacao/cloud2Client");
      if (!cloud2Enabled()) return;
      const {
        resolvePortalPdvIdFromRioPdvKey,
        syncPlayerGatewayRegistryForPdvIds,
      } = await import("@/lib/player/playerGatewaySync");
      const portalPdvId = await resolvePortalPdvIdFromRioPdvKey(rioPdvKey);
      if (!portalPdvId) return;
      await syncPlayerGatewayRegistryForPdvIds([portalPdvId]);
    } catch (e) {
      console.error("[cadastro PATCH] sync gateway falhou", { rioPdvKey, err: e });
    }
  });
}

export async function GET(req: Request, context: Ctx) {
  const { rioPdvKey: raw } = await context.params;
  const rioPdvKey = decodeURIComponent(raw ?? "").trim();
  if (!rioPdvKey) return NextResponse.json({ error: "invalid_key" }, { status: 400 });

  const url = new URL(req.url);
  const refreshCobranca = url.searchParams.get("refreshCobranca") !== "0";
  const forceCaContatos = url.searchParams.get("forceCa") === "1";

  try {
    const cadastro = await getOrCreatePdvCadastro(rioPdvKey, { refreshCobranca, forceCaContatos });
    return NextResponse.json({ ok: true, cadastro });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, context: Ctx) {
  const { rioPdvKey: raw } = await context.params;
  const rioPdvKey = decodeURIComponent(raw ?? "").trim();
  if (!rioPdvKey) return NextResponse.json({ error: "invalid_key" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const cadastro = await updatePdvCadastro(rioPdvKey, body as never);
    scheduleGatewaySyncForPdv(rioPdvKey);
    return NextResponse.json({ ok: true, cadastro });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
