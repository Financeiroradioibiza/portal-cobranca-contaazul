import { NextResponse } from "next/server";
import { resolvePortalSessionForApi } from "@/lib/auth/portalSessionFromRequest";

export const runtime = "nodejs";

/** Sessão mínima para o site chamados.radioibiza.app.br (sem menuPermissions). */
export async function GET(request: Request) {
  const session = await resolvePortalSessionForApi(request);
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      ok: true,
      email: session.email,
      displayName: session.displayName ?? session.email,
      roles: session.roles,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
