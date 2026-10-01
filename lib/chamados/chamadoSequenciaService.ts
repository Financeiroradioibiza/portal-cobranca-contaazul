import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { ChamadoUserContext } from "@/lib/chamados/chamadoService";
import { chamadoToView } from "@/lib/chamados/chamadoUtils";
import type { ChamadoView } from "@/lib/chamados/chamadoTypes";
import { bumpChamadoInbox } from "@/lib/chamados/chamadoInboxService";
import { notifyChamadoEmail } from "@/lib/chamados/chamadoNotifyEmail";
import {
  enabledSteps,
  type ChamadoTemplateKind,
  type SequenciaStepDraft,
} from "@/lib/chamados/chamadoTemplateSequencia";
import { prazoEndOfDayUtc } from "@/lib/chamados/chamadoPrazoUtils";
import { serializeStringArray } from "@/lib/chamados/chamadoUtils";
import { normalizePortalEmail } from "@/lib/auth/users";

function normalizeEmails(raw: string[]): string[] {
  return [...new Set(raw.map((e) => normalizePortalEmail(e.trim())).filter((e) => e.includes("@")))];
}

function normalizeSetores(raw: string[]): string[] {
  return [...new Set(raw.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function creatorAsResponsavel(ctx: ChamadoUserContext, extras: string[]): string[] {
  return [...new Set([ctx.email, ...normalizeEmails(extras)])];
}

export async function createChamadoSequencia(
  tituloRaw: string,
  stepsRaw: SequenciaStepDraft[],
  templateKind: ChamadoTemplateKind,
  ctx: ChamadoUserContext,
  meta: {
    prioridade: import("@prisma/client").ChamadoPrioridade;
    rioLinhaId?: string | null;
    rioPdvKey?: string | null;
    clienteNome?: string;
  },
): Promise<{ grupoId: string; chamados: ChamadoView[] }> {
  const titulo = tituloRaw.trim().slice(0, 200);
  if (!titulo) throw new Error("titulo_obrigatorio");

  const steps = enabledSteps(stepsRaw);
  if (steps.length === 0) throw new Error("sequencia_vazia");

  const grupoId = randomUUID();
  const total = steps.length;
  const createdViews: ChamadoView[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const status = i === 0 ? "aberto" : "aguardando";
    const prazo =
      step.prazoEm && /^\d{4}-\d{2}-\d{2}$/.test(step.prazoEm) ?
        prazoEndOfDayUtc(step.prazoEm)
      : null;

    const row = await prisma.chamado.create({
      data: {
        titulo,
        descricao: step.descricao.trim(),
        status,
        prioridade: meta.prioridade,
        setoresJson: serializeStringArray(normalizeSetores(step.setores)),
        responsaveisJson: serializeStringArray(creatorAsResponsavel(ctx, step.responsaveisExtras)),
        criadoPorEmail: ctx.email,
        criadoPorNome: ctx.displayName,
        rioLinhaId: meta.rioLinhaId ?? null,
        rioPdvKey: meta.rioPdvKey ?? null,
        clienteNome: meta.clienteNome?.slice(0, 200) ?? "",
        templateKind,
        sequenciaGrupoId: grupoId,
        sequenciaPasso: i + 1,
        sequenciaTotal: total,
        sequenciaRotulo: step.rotulo.slice(0, 120),
        prazoEntrega: prazo,
      },
    });

    const view = chamadoToView(row);
    createdViews.push(view);

    if (i === 0) {
      try {
        await notifyChamadoEmail(view, "created");
      } catch (e) {
        console.error("[sequencia] e-mail etapa 1", e);
      }
      try {
        await bumpChamadoInbox(view, { kind: "created", actorEmail: ctx.email });
      } catch (e) {
        console.error("[sequencia] inbox etapa 1", e);
      }
    }
  }

  return { grupoId, chamados: createdViews };
}

export async function createClienteNovoSequencia(
  tituloRaw: string,
  stepsRaw: SequenciaStepDraft[],
  ctx: ChamadoUserContext,
  meta: Parameters<typeof createChamadoSequencia>[4],
): Promise<{ grupoId: string; chamados: ChamadoView[] }> {
  return createChamadoSequencia(tituloRaw, stepsRaw, "cliente_novo", ctx, meta);
}

export async function createVinhetasSequencia(
  tituloRaw: string,
  stepsRaw: SequenciaStepDraft[],
  ctx: ChamadoUserContext,
  meta: Parameters<typeof createChamadoSequencia>[4],
): Promise<{ grupoId: string; chamados: ChamadoView[] }> {
  return createChamadoSequencia(tituloRaw, stepsRaw, "vinhetas", ctx, meta);
}

export async function avancarSequenciaChamado(
  chamadoId: string,
  ctx: ChamadoUserContext,
): Promise<{ fechado: ChamadoView; proximo: ChamadoView | null; fim: boolean }> {
  const current = await prisma.chamado.findUnique({ where: { id: chamadoId } });
  if (!current || !current.sequenciaGrupoId) throw new Error("not_sequencia");

  const now = new Date();
  const closed = await prisma.chamado.update({
    where: { id: chamadoId },
    data: {
      status: "fechado",
      fechadoPorEmail: ctx.email,
      fechadoPorNome: ctx.displayName,
      fechadoEm: now,
    },
  });
  const closedView = chamadoToView(closed);

  try {
    await notifyChamadoEmail(closedView, "closed");
  } catch (e) {
    console.error("[sequencia] e-mail fechamento", e);
  }

  const nextRow = await prisma.chamado.findFirst({
    where: {
      sequenciaGrupoId: current.sequenciaGrupoId,
      sequenciaPasso: (current.sequenciaPasso ?? 0) + 1,
      status: "aguardando",
    },
  });

  if (!nextRow) {
    return { fechado: closedView, proximo: null, fim: true };
  }

  const opened = await prisma.chamado.update({
    where: { id: nextRow.id },
    data: { status: "aberto", updatedAt: now },
  });
  const openedView = chamadoToView(opened);

  try {
    await notifyChamadoEmail(openedView, "created");
  } catch (e) {
    console.error("[sequencia] e-mail próxima etapa", e);
  }
  try {
    await bumpChamadoInbox(openedView, { kind: "created", actorEmail: ctx.email });
  } catch (e) {
    console.error("[sequencia] inbox próxima etapa", e);
  }

  return { fechado: closedView, proximo: openedView, fim: false };
}
