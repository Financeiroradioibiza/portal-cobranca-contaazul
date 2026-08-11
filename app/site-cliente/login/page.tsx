import { Suspense } from "react";
import { SiteClienteLoginForm } from "@/components/site-cliente/SiteClienteLoginForm";
import { SiteClienteLoginHero } from "@/components/site-cliente/SiteClienteLoginHero";

export default function SiteClienteLoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <SiteClienteLoginHero />
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <Suspense fallback={<p className="text-center text-white/50">Carregando…</p>}>
          <SiteClienteLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
