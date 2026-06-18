import { CriacaoErrorDock } from "@/components/criacao/CriacaoErrorDock";

/** Espaço no rodapé para o painel de diagnóstico fixo (sempre visível nos testes). */
export default function CriacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full pb-[min(46vh,340px)]">
      {children}
      <CriacaoErrorDock />
    </div>
  );
}
