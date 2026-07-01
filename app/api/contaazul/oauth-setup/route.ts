import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/auth/portalAccess";
import { getContaAzulOAuthConfig } from "@/lib/contaazul/config";
import { oauthRedirectUriFromRequest } from "@/lib/contaazul/oauthRedirect";

/** GET — qual redirect_uri o OAuth usará neste domínio (para cadastro na Conta Azul). */
export async function GET(request: Request) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const redirectUri = oauthRedirectUriFromRequest(request);
  let clientIdPrefix = "";
  try {
    const { clientId } = getContaAzulOAuthConfig(redirectUri);
    clientIdPrefix = clientId.length > 8 ? `${clientId.slice(0, 8)}…` : clientId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config_error";
    return NextResponse.json({ ok: false, error: msg, redirectUri }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    redirectUri,
    clientIdPrefix,
    hint:
      "Cadastre redirectUri exatamente igual no Portal do Desenvolvedor Conta Azul (app de produção).",
  });
}
