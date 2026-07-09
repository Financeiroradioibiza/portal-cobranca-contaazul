import { ServidorUpMultiUploadPanel } from "@/components/criacao/ServidorUpMultiUploadPanel";

export default function MultiUploadLegadoPage() {
  return (
    <div className="portal-page mx-auto min-h-full max-w-[900px] px-3 py-6 sm:px-4">
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Criação / Servidor UP</div>
        <h1 className="text-2xl font-bold tracking-tight">Multi-Upload legado</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Suba as faixas baixadas no Deemix para as pastas/programações definidas no passo 0 do Servidor UP — uma faixa
          por pasta, sem escolher cliente manualmente.
        </p>
      </div>
      <ServidorUpMultiUploadPanel />
    </div>
  );
}
