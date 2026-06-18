import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { initials, pickDefaultTagCor } from "@/lib/config/portalUserService";

export type CriativoTagOption = {
  email: string;
  displayName: string;
  tagIniciais: string;
  tagCor: string;
};

export async function listCriativosForTag(): Promise<CriativoTagOption[]> {
  const rows = await prisma.portalUser.findMany({
    where: { active: true },
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
    select: { email: true, displayName: true, tagIniciais: true, tagCor: true },
  });

  return rows.map((r) => ({
    email: r.email,
    displayName: r.displayName || r.email,
    tagIniciais: (r.tagIniciais || initials(r.displayName, r.email)).trim().toUpperCase().slice(0, 8),
    tagCor: r.tagCor?.trim() || pickDefaultTagCor(r.email),
  }));
}

/** Valida o criativo escolhido para tag (iniciais/cor); fallback = usuário logado. */
export async function resolveTagCriativoUser(
  requested: string | undefined,
  fallbackEmail: string,
): Promise<{ email: string; displayName: string }> {
  const tryEmail = normalizePortalEmail((requested || "").trim() || fallbackEmail);
  const user = await prisma.portalUser.findUnique({
    where: { email: tryEmail },
    select: { email: true, displayName: true, active: true },
  });
  if (user?.active) {
    return { email: user.email, displayName: user.displayName || user.email };
  }

  const fb = normalizePortalEmail(fallbackEmail);
  const fallback = await prisma.portalUser.findUnique({
    where: { email: fb },
    select: { email: true, displayName: true, active: true },
  });
  if (fallback?.active) {
    return { email: fallback.email, displayName: fallback.displayName || fallback.email };
  }
  return { email: fb, displayName: fb };
}
