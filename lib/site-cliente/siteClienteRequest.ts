import { cookies } from "next/headers";
import {
  SITE_CLIENTE_SESSION_COOKIE,
  verifySiteClienteSessionToken,
  type SiteClienteSessionPayload,
} from "@/lib/site-cliente/session";

export async function getSiteClienteSession(): Promise<SiteClienteSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SITE_CLIENTE_SESSION_COOKIE)?.value;
  return verifySiteClienteSessionToken(raw);
}

export function requireSiteClienteSession(session: SiteClienteSessionPayload | null): SiteClienteSessionPayload {
  if (!session) throw new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  return session;
}
