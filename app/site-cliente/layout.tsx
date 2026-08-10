import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Site Clientes — Radio Ibiza",
  description: "Painel do cliente — status dos PDVs, programação e feedback.",
};

export default function SiteClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
