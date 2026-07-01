import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { siteUrlFromRequest } from "@/lib/contaazul/config";
import { exchangeCodeForTokens } from "@/lib/contaazul/oauth";
import { appendOAuthQuery, safeContaAzulReturnPath } from "@/lib/contaazul/oauthNav";
import { saveTokens } from "@/lib/contaazul/session";

function oauthRedirect(site: string, returnPath: string, key: "connected" | "oauth_error", value: string) {
  const dest = appendOAuthQuery(returnPath, key, value);
  return NextResponse.redirect(`${site}${dest}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const site = siteUrlFromRequest(request);

  const jar = await cookies();
  const returnPath = safeContaAzulReturnPath(jar.get("ca_oauth_return")?.value);
  jar.delete("ca_oauth_return");

  if (oauthError) {
    return oauthRedirect(site, returnPath, "oauth_error", oauthError);
  }

  if (!code || !state) {
    return oauthRedirect(site, returnPath, "oauth_error", "missing_code");
  }

  const expected = jar.get("ca_oauth_state")?.value;
  jar.delete("ca_oauth_state");

  if (!expected || expected !== state) {
    return oauthRedirect(site, returnPath, "oauth_error", "invalid_state");
  }

  try {
    const json = await exchangeCodeForTokens(code);
    await saveTokens(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_error";
    return oauthRedirect(site, returnPath, "oauth_error", msg.slice(0, 500));
  }

  return oauthRedirect(site, returnPath, "connected", "1");
}
