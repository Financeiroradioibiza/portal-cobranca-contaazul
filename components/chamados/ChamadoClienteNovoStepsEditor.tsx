"use client";

import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import {
  buildDefaultClienteNovoSteps,
  type ClienteNovoStepDraft,
  type PrazoModo,
} from "@/lib/chamados/chamadoTemplateClienteNovo";
import { CHAMADO_SETORES } from "@/lib/chamados/chamadoConstants";

type Props = {
  steps: ClienteNovoStepDraft[];
  onChange: (steps: ClienteNovoStepDraft[]) => void;
  prazoModo: PrazoModo;
  onPrazoModo: (m: PrazoModo) => void;
  dataInstalacao: string;
  onDataInstalacao: (ymd: string) => void;
  participants: ChamadoParticipant[];
};

export function ChamadoClienteNovoStepsEditor({
  steps,
  onChange,
  prazoModo,
  onPrazoModo,
  dataInstalacao,
  onDataInstalacao,
  participants,
}: Props) {
  function recalcPrazos(modo: PrazoModo, inst: string) {
    const next = buildDefaultClienteNovoSteps(new Date(), modo, inst || undefined);
    onChange(
      steps.map((s, i) => {
        const hit = next.find((n) => n.key === s.key);
        return { ...s, prazoEm: hit?.prazoEm ?? s.prazoEm };
      }),
    );
  }

  function updateStep(key: ClienteNovoStepDraft["key"], patch: Partial<ClienteNovoStepDraft>) {
    onChange(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function toggleResp(key: ClienteNovoStepDraft["key"], email: string) {
    const step = steps.find((s) => s.key === key);
    if (!step) return;
    const has = step.responsaveisExtras.some((e) => e.toLowerCase() === email.toLowerCase());
    updateStep(key, {
      responsaveisExtras:
        has ?
          step.responsaveisExtras.filter((e) => e.toLowerCase() !== email.toLowerCase())
        : [...step.responsaveisExtras, email],
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <p className="text-xs font-bold text-amber-900 dark:text-amber-100">
        Cliente novo — 4 etapas em série (você acompanha todas; cada setor só na sua fase)
      </p>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={prazoModo === "um_dia_util"}
            onChange={() => {
              onPrazoModo("um_dia_util");
              recalcPrazos("um_dia_util", dataInstalacao);
            }}
          />
          1 dia útil por etapa
        </label>
        <label className="flex flex-wrap items-center gap-1">
          <input
            type="radio"
            checked={prazoModo === "data_instalacao"}
            onChange={() => onPrazoModo("data_instalacao")}
          />
          Prazo final instalação
          <input
            type="date"
            className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-900"
            value={dataInstalacao}
            disabled={prazoModo !== "data_instalacao"}
            onChange={(e) => {
              onDataInstalacao(e.target.value);
              recalcPrazos("data_instalacao", e.target.value);
            }}
          />
        </label>
      </div>

      {steps.map((step) => (
        <div
          key={step.key}
          className={
            "rounded-lg border p-2 " +
            (step.enabled ?
              "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            : "border-dashed border-slate-300 opacity-60 dark:border-slate-600")
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs font-bold">
              <input
                type="checkbox"
                checked={step.enabled}
                onChange={(e) => updateStep(step.key, { enabled: e.target.checked })}
              />
              {step.rotulo}
            </label>
            <label className="ml-auto text-[10px] text-slate-500">
              Prazo{" "}
              <input
                type="date"
                className="rounded border border-slate-300 px-1 py-0.5 dark:border-slate-600 dark:bg-slate-950"
                value={step.prazoEm}
                onChange={(e) => updateStep(step.key, { prazoEm: e.target.value })}
              />
            </label>
          </div>
          {step.enabled ?
            <>
              <input
                className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
                value={step.rotulo}
                onChange={(e) => updateStep(step.key, { rotulo: e.target.value })}
              />
              <textarea
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-950"
                rows={2}
                value={step.descricao}
                onChange={(e) => updateStep(step.key, { descricao: e.target.value })}
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {CHAMADO_SETORES.filter((s) =>
                  ["financeiro", "criacao", "producao", "suporte"].includes(s.id),
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      const has = step.setores.includes(s.id);
                      updateStep(step.key, {
                        setores:
                          has ? step.setores.filter((x) => x !== s.id) : [...step.setores, s.id],
                      });
                    }}
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      (step.setores.includes(s.id) ? s.bg : "bg-slate-100 opacity-50")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {participants.length > 0 ?
                <details className="mt-1 text-[10px]">
                  <summary className="cursor-pointer font-semibold text-violet-700 dark:text-violet-300">
                    + Pessoas extras (além de quem abre o fluxo)
                  </summary>
                  <div className="mt-1 max-h-24 overflow-y-auto">
                    {participants.map((p) => (
                      <label key={p.email} className="flex items-center gap-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={step.responsaveisExtras.some(
                            (e) => e.toLowerCase() === p.email.toLowerCase(),
                          )}
                          onChange={() => toggleResp(step.key, p.email)}
                        />
                        {p.displayName}
                      </label>
                    ))}
                  </div>
                </details>
              : null}
            </>
          : null}
        </div>
      ))}
    </div>
  );
}
