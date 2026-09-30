import { portalSessionTokenFromHeaders } from "@/lib/auth/portalSessionTokenFromRequest";
import { verifyPortalSessionToken, type PortalSessionPayload } from "@/lib/auth/sessionToken";
import { getPortalSession, sessionFromMiddlewareHeaders } from "@/lib/auth/portalAccess";
import { headers } from "next/headers";

/** Sessão para APIs — cookie, middleware headers ou Bearer (app chamados via proxy). */
export async function resolvePortalSessionForApi(
  request?: Request,
): Promise<PortalSessionPayload | null> {
  const fromHelper = await getPortalSession();
  if (fromHelper) return fromHelper;

  if (request) {
    const raw =
      portalSessionTokenFromHeaders(request.headers, request.headers.get("cookie")) ?? undefined;
    if (raw) {
      const verified = await verifyPortalSessionToken(raw);
      if (verified) return verified;
    }
  }

  const h = await headers();
  return sessionFromMiddlewareHeaders(h);
}
