"use client";

import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import {
  buildDefaultClienteNovoSteps,
  buildDefaultVinhetasSteps,
  type PrazoModo,
  type SequenciaStepDraft,
} from "@/lib/chamados/chamadoTemplateSequencia";
import { CHAMADO_SETORES } from "@/lib/chamados/chamadoConstants";

function resolveRafaelEmail(participants: ChamadoParticipant[]): string {
  const hit = participants.find(
    (p) =>
      p.displayName.toLowerCase().includes("rafael") ||
      p.email.toLowerCase().includes("rafael") ||
      p.email.toLowerCase().includes("rafagasparian"),
  );
  return hit?.email ?? "";
}

type Props = {
  variant: "cliente_novo" | "vinhetas";
  steps: SequenciaStepDraft[];
  onChange: (steps: SequenciaStepDraft[]) => void;
  prazoModo: PrazoModo;
  onPrazoModo: (m: PrazoModo) => void;
  dataInstalacao: string;
  onDataInstalacao: (ymd: string) => void;
  participants: ChamadoParticipant[];
};

export function ChamadoClienteNovoStepsEditor({
  variant,
  steps,
  onChange,
  prazoModo,
  onPrazoModo,
  dataInstalacao,
  onDataInstalacao,
  participants,
}: Props) {
  function recalcClienteNovo(modo: PrazoModo, inst: string) {
    const next = buildDefaultClienteNovoSteps(new Date(), modo, inst || undefined);
    onChange(
      steps.map((s) => {
        const hit = next.find((n) => n.key === s.key);
        return { ...s, prazoEm: hit?.prazoEm ?? s.prazoEm };
      }),
    );
  }

  function recalcVinhetas() {
    const next = buildDefaultVinhetasSteps(new Date(), resolveRafaelEmail(participants), 2);
    onChange(
      steps.map((s) => {
        const hit = next.find((n) => n.key === s.key);
        return hit ?
            { ...s, prazoEm: hit.prazoEm, responsaveisExtras: hit.responsaveisExtras }
          : s;
      }),
    );
  }

  function updateStep(key: string, patch: Partial<SequenciaStepDraft>) {
    onChange(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function toggleResp(key: string, email: string) {
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

  const setorIds =
    variant === "vinhetas" ?
      ["producao"]
    : ["financeiro", "criacao", "producao", "suporte"];

  return (
    <div
      className={
        "mt-3 space-y-3 rounded-xl border p-3 " +
        (variant === "vinhetas" ?
          "border-pink-200 bg-pink-50/60 dark:border-pink-900 dark:bg-pink-950/20"
        : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20")
      }
    >
      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
        {variant === "vinhetas" ?
          "Vinhetas — 2 etapas (2 dias úteis cada). Quem abre o fluxo acompanha todas."
        : "Cliente novo — 4 etapas em série (você acompanha todas; cada setor só na sua fase)"}
      </p>

      {variant === "cliente_novo" ?
        <div className="flex flex-wrap gap-2 text-[11px]">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={prazoModo === "um_dia_util"}
              onChange={() => {
                onPrazoModo("um_dia_util");
                recalcClienteNovo("um_dia_util", dataInstalacao);
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
                recalcClienteNovo("data_instalacao", e.target.value);
              }}
            />
          </label>
        </div>
      : <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            className="rounded-lg border border-pink-300 bg-white px-2 py-0.5 font-semibold dark:border-pink-800 dark:bg-slate-900"
            onClick={() => {
              onPrazoModo("dois_dias_uteis");
              recalcVinhetas();
            }}
          >
            Recalcular 2 dias úteis / etapa
          </button>
          <span className="text-slate-500">Prazos entram na agenda do dashboard.</span>
        </div>
      }

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
            {variant === "cliente_novo" ?
              <label className="flex items-center gap-1 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(e) => updateStep(step.key, { enabled: e.target.checked })}
                />
                {step.rotulo}
              </label>
            : <span className="text-xs font-bold">{step.rotulo}</span>}
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
          {step.enabled || variant === "vinhetas" ?
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
              {setorIds.length > 0 && (variant !== "vinhetas" || step.key === "subida_producao") ?
                <div className="mt-1 flex flex-wrap gap-1">
                  {CHAMADO_SETORES.filter((s) => setorIds.includes(s.id)).map((s) => (
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
              : null}
              {participants.length > 0 ?
                <details className="mt-1 text-[10px]" open={variant === "vinhetas" && step.key === "criacao_vinheta"}>
                  <summary className="cursor-pointer font-semibold text-violet-700 dark:text-violet-300">
                    Pessoas nesta etapa (quem abre o fluxo entra sempre)
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
