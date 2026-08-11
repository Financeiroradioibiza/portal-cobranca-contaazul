export const dynamic = "force-dynamic";

import { DM_Sans, Bebas_Neue } from "next/font/google";
import { PortalShell } from "@/components/portal/PortalShell";
import { guardPortalPage, resolvePortalPathname } from "@/lib/auth/portalPageGuard";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  weight: "400",
});

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await guardPortalPage(await resolvePortalPathname());

  return (
    <div className={`${dmSans.variable} ${bebasNeue.variable} h-full`}>
      <PortalShell>{children}</PortalShell>
    </div>
  );
}
