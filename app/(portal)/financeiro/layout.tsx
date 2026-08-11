import { guardPortalPage, resolvePortalPathname } from "@/lib/auth/portalPageGuard";

export const dynamic = "force-dynamic";

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  await guardPortalPage(await resolvePortalPathname());
  return children;
}
