import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { getPortalMenuPermissionsForEmail } from "@/lib/config/portalUserPermissions";
import { fetchPreviewMusicalSupabaseSession } from "@/lib/previewMusical/bootstrapSupabaseSession";
import { isPathAllowedByMenuPermissions } from "@/lib/portal/pathMenuMap";

export const dynamic = "force-dynamic";

/** Sessão Supabase para quem já está logado no portal (sem email/senha no iframe). */
export async function GET() {
  const session = requirePortalSession(await getPortalSession());
  const perm = await getPortalMenuPermissionsForEmail(session.email);
  if (!isPathAllowedByMenuPermissions("/criacao/preview-musical", perm)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const tokens = await fetchPreviewMusicalSupabaseSession();
    return Response.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bootstrap_failed";
    if (msg.includes("not_configured")) {
      return Response.json({ error: msg }, { status: 503 });
    }
    console.error("[preview-musical/bootstrap-auth]", e);
    return Response.json({ error: "supabase_login_failed" }, { status: 502 });
  }
}
