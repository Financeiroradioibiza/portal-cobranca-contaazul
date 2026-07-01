import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/contaazul/oauth";
import { getContaAzulOAuthConfig, siteUrlFromRequest } from "@/lib/contaazul/config";
import { createCaOAuthState } from "@/lib/contaazul/oauthState";

export async function GET(request: Request) {
  const site = siteUrlFromRequest(request);

  try {
    getContaAzulOAuthConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config OAuth inválida";
    return NextResponse.redirect(
      `${site}/financeiro/vencidos?oauth_error=${encodeURIComponent(msg.slice(0, 500))}`,
    );
  }

  const state = createCaOAuthState();
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
