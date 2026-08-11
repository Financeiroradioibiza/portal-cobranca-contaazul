import { Suspense } from "react";
import { SiteClienteLoginForm } from "@/components/site-cliente/SiteClienteLoginForm";
import { SiteClienteLoginHero } from "@/components/site-cliente/SiteClienteLoginHero";
import { SITE_CLIENTE_MOBILE_BASE } from "@/lib/site-cliente/mobileDetect";

export default function SiteClienteMobileLoginPage() {
  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center">
      <SiteClienteLoginHero />
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <Suspense fallback={<p className="text-center text-white/50">Carregando…</p>}>
          <SiteClienteLoginForm basePath={SITE_CLIENTE_MOBILE_BASE} />
        </Suspense>
      </div>
      <p className="mt-4 text-center text-xs text-white/40">
        <a href="/site-cliente/login?desktop=1" className="underline hover:text-white/70">
          Ver versão desktop
        </a>
      </p>
    </div>
  );
}
