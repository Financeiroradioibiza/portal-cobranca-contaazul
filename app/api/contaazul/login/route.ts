import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/contaazul/oauth";
import { getContaAzulOAuthConfig, siteUrlFromRequest } from "@/lib/contaazul/config";
import { oauthRedirectUriFromRequest } from "@/lib/contaazul/oauthRedirect";

const OAUTH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

const AFTER_OAUTH = "/financeiro/vencidos";

export async function GET(request: Request) {
  const site = siteUrlFromRequest(request);
  const redirectUri = oauthRedirectUriFromRequest(request);

  try {
    getContaAzulOAuthConfig(redirectUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config OAuth inválida";
    return NextResponse.redirect(
      `${site}${AFTER_OAUTH}?oauth_error=${encodeURIComponent(msg.slice(0, 500))}`,
    );
  }

  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set("ca_oauth_state", state, OAUTH_COOKIE);
  jar.set("ca_oauth_redirect", redirectUri, OAUTH_COOKIE);

  return NextResponse.redirect(buildAuthorizeUrl(state, redirectUri));
}
