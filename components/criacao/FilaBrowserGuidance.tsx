/** Orientação sobre manter ou fechar o navegador em cada etapa do upload/fila. */

export type FilaBrowserPhase =
  | "upload-preparando"
  | "upload-enviando"
  | "fila-processando"
  | "fila-revisao"
  | "fila-concluido";

const PHASE: Record<
  FilaBrowserPhase,
  { title: string; body: string; tone: string; icon: string }
> = {
  "upload-preparando": {
    icon: "✓",
    title: "Pode fechar o navegador",
    body: "Enquanto você monta os lotes e escolhe os MP3, ainda não há envio em andamento.",
    tone:
      "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  "upload-enviando": {
    icon: "⚠",
    title: "Não feche o navegador agora",
    body: "Os arquivos ainda estão saindo do seu computador para o servidor de áudio. Se fechar a aba, o envio pode parar no meio.",
    tone:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  },
  "fila-processando": {
    icon: "✓",
    title: "Pode fechar o navegador",
    body: "Os MP3 já chegaram ao servidor. Dedupe, normalização LUFS e tags rodam no cloud2 — você não precisa deixar esta página aberta.",
    tone:
      "border-sky-200 bg-sky-50/80 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  },
  "fila-revisao": {
    icon: "◷",
    title: "Revise as duplicatas",
    body: "Este lote tem possíveis duplicatas para comparar. Resolva cada uma abaixo; o restante já foi processado automaticamente.",
    tone:
      "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  },
  "fila-concluido": {
    icon: "✓",
    title: "Lote finalizado",
    body: "Nada pendente neste job. Pode fechar o navegador à vontade.",
    tone:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  },
};

export function filaPhaseFromJobStatus(status: string): FilaBrowserPhase {
  if (status === "revisao") return "fila-revisao";
  if (status === "concluido" || status === "erro" || status === "cancelado") return "fila-concluido";
  return "fila-processando";
}

export function FilaBrowserGuidance({ phase }: { phase: FilaBrowserPhase }) {
  const c = PHASE[phase];
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${c.tone}`}>
      <div className="font-semibold">
        <span aria-hidden>{c.icon} </span>
        {c.title}
      </div>
      <p className="mt-0.5 leading-relaxed opacity-95">{c.body}</p>
    </div>
  );
}

/** Resumo das três fases — Upload, Fila e Revisão. */
export function FilaBrowserGuidanceOverview({ compact = false }: { compact?: boolean }) {
  const steps = [
    {
      label: "1. Enviar MP3",
      nao: "Durante «Enviando X/Y…» — não feche.",
      sim: "Antes de clicar em Subir, ou depois que todos os arquivos subiram.",
    },
    {
      label: "2. Processamento (Kanban)",
      nao: "—",
      sim: "Aguardando / Processando — roda no servidor; pode fechar.",
    },
    {
      label: "3. Revisão (só se necessário)",
      nao: "—",
      sim: "Duplicatas ou erros — demais lotes concluem sozinhos; pode fechar.",
    },
  ];

  if (compact) {
    return (
      <details className="rounded-lg border border-slate-200 bg-slate-50/80 text-xs dark:border-slate-800 dark:bg-slate-900/40">
        <summary className="cursor-pointer px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
          Quando posso fechar o navegador?
        </summary>
        <div className="space-y-2 border-t border-slate-200 px-3 py-2 dark:border-slate-800">
          {steps.map((s) => (
            <div key={s.label}>
              <div className="font-semibold text-slate-700 dark:text-slate-200">{s.label}</div>
              <div className="text-amber-800 dark:text-amber-300">
                <span className="font-medium">Não feche:</span> {s.nao}
              </div>
              <div className="text-emerald-800 dark:text-emerald-300">
                <span className="font-medium">Pode fechar:</span> {s.sim}
              </div>
            </div>
          ))}
        </div>
      </details>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-2 font-semibold text-slate-700 dark:text-slate-200">Quando fechar o navegador?</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="pb-2 pr-3 font-semibold">Etapa</th>
              <th className="pb-2 pr-3 font-semibold text-amber-800 dark:text-amber-300">Não feche</th>
              <th className="pb-2 font-semibold text-emerald-800 dark:text-emerald-300">Pode fechar</th>
            </tr>
          </thead>
          <tbody className="text-slate-600 dark:text-slate-300">
            {steps.map((s) => (
              <tr key={s.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{s.label}</td>
                <td className="py-2 pr-3">{s.nao}</td>
                <td className="py-2">{s.sim}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
