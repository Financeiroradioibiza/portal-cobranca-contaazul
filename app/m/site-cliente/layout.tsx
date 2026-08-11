import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Site Clientes — Radio Ibiza",
  description: "Painel do cliente — status dos PDVs, programação e feedback.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f172a",
};

export default function SiteClienteMobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 text-white">
      <div className="mx-auto max-w-lg px-3 py-4 pb-8 safe-area-pb">{children}</div>
    </div>
  );
}
