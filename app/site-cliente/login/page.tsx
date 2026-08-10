import { Suspense } from "react";
import { SiteClienteLoginForm } from "@/components/site-cliente/SiteClienteLoginForm";

export default function SiteClienteLoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="mb-8 text-center">
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-fuchsia-300">
          Radio Ibiza
        </div>
        <h1 className="text-3xl font-bold">Área do cliente</h1>
        <p className="mt-2 text-sm text-white/60">
          Acompanhe seus PDVs, programação musical e feedbacks.
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <Suspense fallback={<p className="text-center text-white/50">Carregando…</p>}>
          <SiteClienteLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
