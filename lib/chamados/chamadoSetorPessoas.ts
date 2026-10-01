import type { SequenciaStepDraft } from "@/lib/chamados/chamadoTemplateSequencia";

/** Setores que viram pessoas nomeadas (sem tag de setor no chamado). */
export const CHAMADO_SETOR_COM_PESSOAS = ["producao", "suporte"] as const;

export const CHAMADO_SETOR_PESSOAS_PADRAO: Record<string, string[]> = {
  producao: ["renato@radioibiza.com.br"],
  suporte: ["anderson@radioibiza.com.br", "marize@radioibiza.com.br"],
};

export function emailsForChamadoSetor(setorId: string): string[] {
  const key = setorId.trim().toLowerCase();
  const envKey = `CHAMADO_${key.toUpperCase()}_PESSOAS`;
  const raw =
    typeof process !== "undefined" ? process.env[envKey]?.trim() : undefined;
  if (raw) {
    return [
      ...new Set(
        raw
          .split(/[,;\s]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@")),
      ),
    ];
  }
  return [...(CHAMADO_SETOR_PESSOAS_PADRAO[key] ?? [])];
}

export function setorUsaPessoasNomeadas(setorId: string): boolean {
  return emailsForChamadoSetor(setorId).length > 0;
}

export function setorMarcadoNoStep(step: SequenciaStepDraft, setorId: string): boolean {
  const emails = emailsForChamadoSetor(setorId);
  if (emails.length > 0) {
    return emails.every((e) =>
      step.responsaveisExtras.some((r) => r.toLowerCase() === e.toLowerCase()),
    );
  }
  return step.setores.includes(setorId);
}

export function toggleSetorNoStep(step: SequenciaStepDraft, setorId: string): SequenciaStepDraft {
  const emails = emailsForChamadoSetor(setorId);
  if (emails.length === 0) {
    const has = step.setores.includes(setorId);
    return {
      ...step,
      setores: has ? step.setores.filter((x) => x !== setorId) : [...step.setores, setorId],
    };
  }

  const enabled = setorMarcadoNoStep(step, setorId);
  let responsaveisExtras = [...step.responsaveisExtras];
  const setores = step.setores.filter((s) => s !== setorId);

  if (enabled) {
    responsaveisExtras = responsaveisExtras.filter(
      (r) => !emails.some((e) => e.toLowerCase() === r.toLowerCase()),
    );
  } else {
    for (const e of emails) {
      if (!responsaveisExtras.some((r) => r.toLowerCase() === e.toLowerCase())) {
        responsaveisExtras.push(e);
      }
    }
  }

  return { ...step, setores, responsaveisExtras };
}

export function normalizeStepSetorParaPessoas(step: SequenciaStepDraft): SequenciaStepDraft {
  let setores = [...step.setores];
  let responsaveisExtras = [...step.responsaveisExtras];
  for (const setorId of CHAMADO_SETOR_COM_PESSOAS) {
    if (!setores.includes(setorId)) continue;
    setores = setores.filter((s) => s !== setorId);
    for (const e of emailsForChamadoSetor(setorId)) {
      if (!responsaveisExtras.some((r) => r.toLowerCase() === e.toLowerCase())) {
        responsaveisExtras.push(e);
      }
    }
  }
  return { ...step, setores, responsaveisExtras };
}

export function applySetorPessoasOnSteps(steps: SequenciaStepDraft[]): SequenciaStepDraft[] {
  return steps.map((s) => normalizeStepSetorParaPessoas(s));
}
