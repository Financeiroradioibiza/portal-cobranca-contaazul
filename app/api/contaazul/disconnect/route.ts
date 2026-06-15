import { NextResponse } from "next/server";
import { requireMasterSession } from "@/lib/auth/portalAccess";
import { clearTokens } from "@/lib/contaazul/session";

export async function POST() {
  try {
    await requireMasterSession();
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await clearTokens();
  return NextResponse.json({ ok: true });
}
