import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/auth/portalAccess";
import { isRouteAccessAllowed, resolveRouteAccessRule } from "@/lib/auth/routeAccess";
import { getPortalMenuPermissionsForEmail } from "@/lib/config/portalUserPermissions";
import { isPathAllowedByMenuPermissions } from "@/lib/portal/pathMenuMap";
import { resolveCadastrosHomeHref } from "@/lib/portal/cadastrosNav";

export default async function CadastrosPage() {
  const session = await getPortalSession();
  if (!session) {
    redirect("/login?next=%2Fcadastros");
  }

  const perm = await getPortalMenuPermissionsForEmail(session.email);
  const target = resolveCadastrosHomeHref(perm);

  if (!isPathAllowedByMenuPermissions(target, perm)) {
    redirect("/?error=forbidden");
  }

  const rule = resolveRouteAccessRule(target);
  if (rule && !isRouteAccessAllowed(rule, session.roles)) {
    redirect("/?error=forbidden");
  }

  redirect(target);
}
