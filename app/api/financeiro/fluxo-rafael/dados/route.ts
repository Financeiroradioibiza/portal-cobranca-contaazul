import { NextResponse } from "next/server";
import {
  getFluxoRafaelStore,
  setFluxoRafaelDados,
  type FluxoRafaelDados,
} from "@/lib/financeiro/fluxoRafaelService";
import { requireFluxoRafaelSession } from "@/lib/auth/portalAccess";

export async function GET() {
  await requireFluxoRafaelSession();
  const store = await getFluxoRafaelStore();
  return NextResponse.json(store);
}

export async function PUT(request: Request) {
  const session = await requireFluxoRafaelSession();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  await setFluxoRafaelDados(body as FluxoRafaelDados, session.email);
  const store = await getFluxoRafaelStore();
  return NextResponse.json({
    ok: true,
    updatedAt: store.updatedAt,
    updatedBy: store.updatedBy,
  });
}

/** Compatível com POST do app legado (Netlify). */
export async function POST(request: Request) {
  return PUT(request);
}
