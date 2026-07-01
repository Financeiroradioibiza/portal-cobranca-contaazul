import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/contaazul/oauth";
import { getContaAzulOAuthConfig, siteUrlFromRequest } from "@/lib/contaazul/config";
import { appendOAuthQuery, safeContaAzulReturnPath } from "@/lib/contaazul/oauthNav";

const OAUTH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(request: Request) {
  const site = siteUrlFromRequest(request);
  const returnRaw = new URL(request.url).searchParams.get("return");
  const returnPath = safeContaAzulReturnPath(returnRaw);

  try {
    getContaAzulOAuthConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config OAuth inválida";
    const dest = appendOAuthQuery(returnPath, "oauth_error", msg.slice(0, 500));
    return NextResponse.redirect(`${site}${dest}`);
  }

  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set("ca_oauth_state", state, OAUTH_COOKIE);
  jar.set("ca_oauth_return", returnPath, OAUTH_COOKIE);

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
