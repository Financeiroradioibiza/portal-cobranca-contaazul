"use client";

import type { SemanaBloco } from "@/lib/site-cliente/estiloAgora";
import { AgendaSemanaChart } from "@/components/criacao/AgendaSemanaChart";

type Props = {
  clienteNome: string;
  blocos: SemanaBloco[];
  canExport: boolean;
};

export function SiteClienteSemanaChart({ clienteNome, blocos, canExport }: Props) {
  return (
    <AgendaSemanaChart
      blocos={blocos}
      exportLabel={clienteNome}
      canExport={canExport}
      theme="dark"
    />
  );
}
