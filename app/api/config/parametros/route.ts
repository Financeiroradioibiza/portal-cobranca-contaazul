import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";

/** Parâmetros globais — ponto de mix fixo removido; regras automáticas no worker cloud2. */
export async function GET() {
  try {
    await requireMasterSession();
    return NextResponse.json({ ok: true, mixAutomatico: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/parametros GET]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    await requireMasterSession();
    return NextResponse.json({ ok: true, mixAutomatico: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[config/parametros PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
