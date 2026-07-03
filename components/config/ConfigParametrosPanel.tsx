"use client";

export function ConfigParametrosPanel() {
  return (
    <div className="mx-auto max-w-[800px] px-3 py-6 sm:px-4">
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Configuração / Parâmetros globais
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Parâmetros globais</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Ajustes que valem para todo o portal.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold">Criação musical — ponto de mix (automático)</h2>
        <p className="mt-3 max-w-xl text-sm text-slate-600 dark:text-slate-300">
          Upload, ATL CRICA e o botão &quot;Detectar ponto de mix&quot; usam detecção automática só do fade:
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <strong>Fade de rádio</strong> nos últimos segundos → mix na <strong>2.ª metade</strong> do fade
            (meio do fade final, não no pico ainda subindo)
          </li>
          <li>
            <strong>Outro quieto contínuo</strong> (ex. violão/voz baixa no fim) → mix = 0
          </li>
          <li>
            <strong>Sem fade detectado</strong> → mix = 0
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          <strong>Trim</strong> (cortar início/fim) é sempre manual em{" "}
          <strong>Criação › Edição de música</strong>.
        </p>
      </div>
    </div>
  );
}
