import { CriacaoErrorDock } from "@/components/criacao/CriacaoErrorDock";

export default function CriacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CriacaoErrorDock />
    </>
  );
}
