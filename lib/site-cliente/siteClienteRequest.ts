import { cookies, headers } from "next/headers";
import {
  SITE_CLIENTE_SESSION_COOKIE,
  SITE_CLIENTE_SESSION_HEADER,
  siteClienteSessionTokenFromRequestHeaders,
  verifySiteClienteSessionToken,
  type SiteClienteSessionPayload,
} from "@/lib/site-cliente/session";

export async function getSiteClienteSession(): Promise<SiteClienteSessionPayload | null> {
  const jar = await cookies();
  const hdrs = await headers();
  const raw =
    jar.get(SITE_CLIENTE_SESSION_COOKIE)?.value ??
    siteClienteSessionTokenFromRequestHeaders({
      cookieHeader: hdrs.get("cookie"),
      sessionHeader: hdrs.get(SITE_CLIENTE_SESSION_HEADER),
      authorization: hdrs.get("authorization"),
    });
  return verifySiteClienteSessionToken(raw);
}

export function requireSiteClienteSession(session: SiteClienteSessionPayload | null): SiteClienteSessionPayload {
  if (!session) throw new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  return session;
}
