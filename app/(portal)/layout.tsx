import { DM_Sans, Bebas_Neue } from "next/font/google";
import { PortalShell } from "@/components/portal/PortalShell";

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

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${dmSans.variable} ${bebasNeue.variable} h-full`}>
      <PortalShell>{children}</PortalShell>
    </div>
  );
}
