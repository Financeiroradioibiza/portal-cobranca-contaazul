import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/contaazul/oauth";
import { getContaAzulOAuthConfig } from "@/lib/contaazul/config";

export async function GET() {
  try {
    getContaAzulOAuthConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config OAuth inválida";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set("ca_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
