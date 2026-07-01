import { NextResponse } from "next/server";
import { siteUrlFromRequest } from "@/lib/contaazul/config";
import { exchangeCodeForTokens } from "@/lib/contaazul/oauth";
import { verifyCaOAuthState } from "@/lib/contaazul/oauthState";
import { saveTokens } from "@/lib/contaazul/session";

const AFTER_OAUTH = "/financeiro/vencidos";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const site = siteUrlFromRequest(request);

  if (oauthError) {
    return NextResponse.redirect(
      `${site}${AFTER_OAUTH}?oauth_error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${site}${AFTER_OAUTH}?oauth_error=missing_code`);
  }

  if (!verifyCaOAuthState(state)) {
    return NextResponse.redirect(`${site}${AFTER_OAUTH}?oauth_error=invalid_state`);
  }

  try {
    const json = await exchangeCodeForTokens(code);
    await saveTokens(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_error";
    return NextResponse.redirect(
      `${site}${AFTER_OAUTH}?oauth_error=${encodeURIComponent(msg.slice(0, 500))}`,
    );
  }

  return NextResponse.redirect(`${site}${AFTER_OAUTH}?connected=1`);
}
