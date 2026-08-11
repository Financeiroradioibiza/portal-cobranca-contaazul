import { RadioIbizaRMark } from "@/components/site-cliente/RadioIbizaRMark";

export function SiteClienteLoginHero() {
  return (
    <div className="mb-8 text-center">
      <div className="mb-4 flex justify-center">
        <RadioIbizaRMark size={64} />
      </div>
      <div className="mb-1 text-sm font-semibold uppercase tracking-widest text-fuchsia-300">
        Radio Ibiza
      </div>
      <h1 className="text-3xl font-bold">Área do cliente</h1>
      <p className="mt-2 text-sm text-white/60">
        Acompanhe seus PDVs, programação musical e feedbacks.
      </p>
    </div>
  );
}
