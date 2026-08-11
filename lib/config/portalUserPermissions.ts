import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import {
  parseProfilePermissionsJson,
  parseRolesJson,
  type PortalPermissionsMap,
} from "@/lib/portal/menuPermissions";

export async function getPortalMenuPermissionsForEmail(
  emailRaw: string,
): Promise<PortalPermissionsMap | "all"> {
  const email = normalizePortalEmail(emailRaw);
  try {
    const user = await prisma.portalUser.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user?.active || !user.profile) return {};
    const roles = parseRolesJson(user.profile.rolesJson);
    if (roles.includes("master")) return "all";
    return parseProfilePermissionsJson(user.profile.permissionsJson);
  } catch {
    return {};
  }
}
