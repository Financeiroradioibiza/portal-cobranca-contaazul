import { collectPortalSessionTokenCandidates } from "@/lib/auth/portalSessionTokenFromRequest";
import { verifyPortalSessionToken, type PortalSessionPayload } from "@/lib/auth/sessionToken";
import { getPortalSession, sessionFromMiddlewareHeaders } from "@/lib/auth/portalAccess";
import { headers } from "next/headers";

async function verifyFirstSessionCandidate(
  candidates: string[],
): Promise<PortalSessionPayload | null> {
  for (const raw of candidates) {
    const verified = await verifyPortalSessionToken(raw);
    if (verified) return verified;
  }
  return null;
}

/** Sessão para APIs — cookie, middleware headers ou Bearer (app chamados via proxy). */
export async function resolvePortalSessionForApi(
  request?: Request,
): Promise<PortalSessionPayload | null> {
  if (request) {
    const fromRequest = await verifyFirstSessionCandidate(
      collectPortalSessionTokenCandidates(request.headers, request.headers.get("cookie")),
    );
    if (fromRequest) return fromRequest;
  }

  const fromHelper = await getPortalSession();
  if (fromHelper) return fromHelper;

  const h = await headers();
  return sessionFromMiddlewareHeaders(h);
}
