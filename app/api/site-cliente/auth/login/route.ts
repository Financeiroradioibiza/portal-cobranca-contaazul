import { NextResponse } from "next/server";
import { authenticateSiteClienteUser } from "@/lib/site-cliente/siteClienteAdminService";
import {
  clientIpFromRequest,
  loginRateLimitExceeded,
} from "@/lib/site-cliente/loginRateLimit";
import {
  signSiteClienteSession,
  siteClienteSessionCookieOptions,
  siteClienteCookieHostFromRequest,
  SITE_CLIENTE_SESSION_COOKIE,
} from "@/lib/site-cliente/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req);
    if (loginRateLimitExceeded(ip)) {
      return NextResponse.json({ error: "rate_limit" }, { status: 429 });
    }

    const body = (await req.json()) as { loginEmail?: string; password?: string };
    const user = await authenticateSiteClienteUser(body.loginEmail ?? "", body.password ?? "");
    if (!user) {
      return NextResponse.json({ error: "credenciais_invalidas" }, { status: 401 });
    }

    const token = await signSiteClienteSession({
      userId: user.id,
      grupoId: user.grupoId,
      grupoNome: user.grupoNome,
      nome: user.nome,
      loginEmail: user.loginEmail,
      permissoes: user.permissoes,
    });

    const res = NextResponse.json({
      ok: true,
      nome: user.nome,
      grupoNome: user.grupoNome,
    });
    res.cookies.set(
      SITE_CLIENTE_SESSION_COOKIE,
      token,
      siteClienteSessionCookieOptions({ requestHost: siteClienteCookieHostFromRequest(req) }),
    );
    return res;
  } catch (e) {
    console.error("[site-cliente/auth/login POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
