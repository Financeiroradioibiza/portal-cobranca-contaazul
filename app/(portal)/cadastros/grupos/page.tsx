import { CadastrosGruposPanel } from "@/components/cadastros/CadastrosGruposPanel";

/** Rota legada — grupos acessível por URL; menu lateral só lista vínculos. */
export default function CadastrosGruposPage() {
  return (
    <div className="portal-page min-h-full min-w-0">
      <div className="portal-page-body">
        <CadastrosGruposPanel />
      </div>
    </div>
  );
}
