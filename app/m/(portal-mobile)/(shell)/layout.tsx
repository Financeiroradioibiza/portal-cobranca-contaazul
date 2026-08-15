export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { guardMobilePortalPage, resolveMobilePortalPathname } from "@/lib/auth/mobilePortalPageGuard";
import { MobilePortalShell } from "@/components/portal-mobile/MobilePortalShell";
import "@/components/portal-mobile/mobile-portal.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Portal — Radio Ibiza",
  description: "Portal mobile Radio Ibiza",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f4f6f9",
};

export default async function MobilePortalShellLayout({ children }: { children: React.ReactNode }) {
  await guardMobilePortalPage(await resolveMobilePortalPathname());

  return (
    <div className={`${dmSans.variable} font-sans antialiased`}>
      <MobilePortalShell>{children}</MobilePortalShell>
    </div>
  );
}
