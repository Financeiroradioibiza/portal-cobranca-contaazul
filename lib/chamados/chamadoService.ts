import type { Chamado, ChamadoPrioridade, ChamadoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePortalEmail } from "@/lib/auth/users";
import { portalUserHasAvatar } from "@/lib/config/portalUserAvatar";
import { CHAMADO_SETORES } from "@/lib/chamados/chamadoConstants";
import { chamadoToView, parseStringArrayJson, serializeStringArray } from "@/lib/chamados/chamadoUtils";
import { bumpChamadoInbox } from "@/lib/chamados/chamadoInboxService";
import {
  notifyChamadoEmail,
  scheduleChamadoNotifyEmail,
  type ChamadoNotifyKind,
} from "@/lib/chamados/chamadoNotifyEmail";
import type {
  ChamadoParticipant,
  ChamadoView,
  CreateChamadoInput,
  UpdateChamadoInput,
} from "@/lib/chamados/chamadoTypes";

const VALID_SETORES = new Set(CHAMADO_SETORES.map((s) => s.id));
const VALID_PRIORIDADES = new Set<ChamadoPrioridade>(["baixa", "media", "alta", "urgente"]);
const VALID_STATUS = new Set<ChamadoStatus>(["aberto", "em_andamento", "aguardando", "fechado"]);

export type ChamadoUserContext = {
  email: string;
  displayName: string;
  profileSlug: string;
};

const PRIORIDADE_WEIGHT: Record<ChamadoPrioridade, number> = {
  urgente: 4,
  alta: 3,
  media: 2,
  baixa: 1,
};

function sortByPrioridadeThenUpdated(a: Chamado, b: Chamado): number {
  const pw = PRIORIDADE_WEIGHT[b.prioridade] - PRIORIDADE_WEIGHT[a.prioridade];
  if (pw !== 0) return pw;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export { chamadoToView, parseStringArrayJson, serializeStringArray } from "@/lib/chamados/chamadoUtils";

function normalizeSetores(raw: string[]): string[] {
  return [...new Set(raw.map((s) => s.trim()).filter((s) => VALID_SETORES.has(s as typeof CHAMADO_SETORES[number]["id"])))];
}

function normalizeEmails(raw: string[]): string[] {
  return [...new Set(raw.map((e) => normalizePortalEmail(e)).filter((e) => e.includes("@")))];
}

function assigneeListsEqual(a: string[], b: string[]): boolean {
  const key = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()))].sort().join("\0");
  return key(a) === key(b);
}

/** Dispara e-mail quando houve alteração relevante (inclui conclusão). */
function resolveChamadoNotifyOnUpdate(
  existing: Chamado,
  input: UpdateChamadoInput,
): ChamadoNotifyKind | null {
  if (input.status === "fechado" && existing.status !== "fechado") {
    return "closed";
  }

  let changed = false;
  if (input.titulo !== undefined && input.titulo.trim() !== existing.titulo.trim()) changed = true;
  if (input.descricao !== undefined && input.descricao.trim() !== existing.descricao.trim()) {
    changed = true;
  }
  if (input.prioridade !== undefined && input.prioridade !== existing.prioridade) changed = true;
  if (input.status !== undefined && input.status !== existing.status) changed = true;
  if (input.setores !== undefined) {
    const before = normalizeSetores(parseStringArrayJson(existing.setoresJson));
    const after = normalizeSetores(input.setores);
    if (!assigneeListsEqual(before, after)) changed = true;
  }
  if (input.responsaveis !== undefined) {
    const before = normalizeEmails(parseStringArrayJson(existing.responsaveisJson));
    const after = normalizeEmails(input.responsaveis);
    if (!assigneeListsEqual(before, after)) changed = true;
  }

  return changed ? "updated" : null;
}

export function userParticipatesInChamado(
  row: Pick<Chamado, "criadoPorEmail" | "responsaveisJson" | "setoresJson">,
  ctx: ChamadoUserContext,
): boolean {
  const email = ctx.email.toLowerCase();
  if (row.criadoPorEmail.toLowerCase() === email) return true;
  const responsaveis = parseStringArrayJson(row.responsaveisJson).map((r) => r.toLowerCase());
  if (responsaveis.includes(email)) return true;
  const setores = parseStringArrayJson(row.setoresJson);
  if (setores.includes(ctx.profileSlug)) return true;
  return false;
}

export async function getChamadoUserContext(emailRaw: string): Promise<ChamadoUserContext | null> {
  const email = normalizePortalEmail(emailRaw);
  try {
    const row = await prisma.portalUser.findUnique({
      where: { email, active: true },
      include: { profile: { select: { slug: true, name: true } } },
    });
    if (row) {
      return {
        email: row.email,
        displayName: row.displayName.trim() || row.email,
        profileSlug: row.profile.slug,
      };
    }
  } catch {
    /* DB indisponível */
  }
  return {
    email,
    displayName: email,
    profileSlug: "geral",
  };
}

export async function listChamadoParticipants(): Promise<ChamadoParticipant[]> {
  try {
    const rows = await prisma.portalUser.findMany({
      where: { active: true },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        displayName: true,
        tagCor: true,
        avatarMime: true,
        avatarBase64: true,
        updatedAt: true,
        profile: { select: { slug: true, name: true } },
      },
    });
    return rows.map((r) => ({
      userId: r.id,
      email: r.email,
      displayName: r.displayName.trim() || r.email,
      profileSlug: r.profile.slug,
      profileName: r.profile.name,
      tagCor: r.tagCor?.trim() || "#6366f1",
      hasAvatar: portalUserHasAvatar(r),
      avatarVersion: r.updatedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function listAllChamados(): Promise<ChamadoView[]> {
  const rows = await prisma.chamado.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return rows.map(chamadoToView);
}

export async function listOpenChamadosForUser(ctx: ChamadoUserContext): Promise<ChamadoView[]> {
  const rows = await prisma.chamado.findMany({
    where: { status: { in: ["aberto", "em_andamento"] } },
  });
  return rows
    .filter((r) => userParticipatesInChamado(r, ctx))
    .sort(sortByPrioridadeThenUpdated)
    .map(chamadoToView);
}

export async function listChamadosForUser(ctx: ChamadoUserContext): Promise<ChamadoView[]> {
  const rows = await prisma.chamado.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return rows.filter((r) => userParticipatesInChamado(r, ctx)).map(chamadoToView);
}

export async function listChamadosForCliente(opts: {
  rioLinhaId: string;
  rioPdvKeys: string[];
  /** Chamados criados só com o nome do cliente (sem linha/PDV). */
  clienteNome?: string;
}): Promise<ChamadoView[]> {
  let ingestIds: string[] = [];
  if (opts.rioPdvKeys.length > 0) {
    const ingestRows = await prisma.playerIngest.findMany({
      where: {
        rioPdvKey: { in: opts.rioPdvKeys },
        chamadoId: { not: null },
      },
      select: { chamadoId: true },
    });
    ingestIds = [
      ...new Set(ingestRows.map((r) => r.chamadoId).filter((id): id is string => Boolean(id))),
    ];
  }

  const or: Array<Record<string, unknown>> = [];
  const linhaId = opts.rioLinhaId?.trim();
  if (linhaId) or.push({ rioLinhaId: linhaId });
  if (opts.rioPdvKeys.length > 0) {
    or.push({ rioPdvKey: { in: opts.rioPdvKeys } });
  }
  if (ingestIds.length > 0) {
    or.push({ id: { in: ingestIds } });
  }
  const nome = opts.clienteNome?.trim();
  if (nome) {
    or.push({ clienteNome: { equals: nome, mode: "insensitive" } });
  }
  if (or.length === 0) return [];

  try {
    const rows = await prisma.chamado.findMany({
      where: { OR: or },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return rows.map(chamadoToView);
  } catch {
    if (ingestIds.length === 0) return [];
    const rows = await prisma.chamado.findMany({
      where: { id: { in: ingestIds } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return rows.map(chamadoToView);
  }
}

export async function createChamado(
  input: CreateChamadoInput,
  ctx: ChamadoUserContext,
): Promise<ChamadoView> {
  const titulo = input.titulo.trim().slice(0, 200);
  if (!titulo) throw new Error("titulo_obrigatorio");
  const prioridade = VALID_PRIORIDADES.has(input.prioridade) ? input.prioridade : "media";
  const setores = normalizeSetores(input.setores);
  const responsaveis = normalizeEmails(input.responsaveis);
  if (setores.length === 0 && responsaveis.length === 0) {
    if (input.rioLinhaId || input.rioPdvKey) {
      setores.push("relacionamento");
    } else {
      setores.push(ctx.profileSlug === "admin" ? "geral" : ctx.profileSlug);
    }
  }

  const rioLinhaId = input.rioLinhaId?.trim().slice(0, 64) || null;
  const rioPdvKey = input.rioPdvKey?.trim().slice(0, 120) || null;
  const clienteNome = input.clienteNome?.trim().slice(0, 200) ?? "";

  const row = await prisma.chamado.create({
    data: {
      titulo,
      descricao: input.descricao.trim().slice(0, 8000),
      prioridade,
      setoresJson: serializeStringArray(setores),
      responsaveisJson: serializeStringArray(responsaveis),
      criadoPorEmail: ctx.email,
      criadoPorNome: ctx.displayName,
      rioLinhaId,
      rioPdvKey,
      clienteNome,
    },
  });
  const view = chamadoToView(row);
  scheduleChamadoNotifyEmail(view, "created");
  try {
    await bumpChamadoInbox(view, { kind: "created", actorEmail: ctx.email });
  } catch (e) {
    console.error("[chamadoService] inbox create", view.id, e);
  }
  return view;
}

export async function updateChamado(
  id: string,
  input: UpdateChamadoInput,
  ctx: ChamadoUserContext,
): Promise<ChamadoView> {
  const existing = await prisma.chamado.findUnique({ where: { id } });
  if (!existing) throw new Error("not_found");

  const data: {
    titulo?: string;
    descricao?: string;
    prioridade?: ChamadoPrioridade;
    status?: ChamadoStatus;
    setoresJson?: string;
    responsaveisJson?: string;
    fechadoPorEmail?: string | null;
    fechadoPorNome?: string | null;
    fechadoEm?: Date | null;
  } = {};

  /** Pedido inicial (título + descrição) não muda após abertura — só respostas na thread. */
  if (input.prioridade !== undefined && VALID_PRIORIDADES.has(input.prioridade)) {
    data.prioridade = input.prioridade;
  }
  if (input.setores !== undefined) {
    data.setoresJson = serializeStringArray(normalizeSetores(input.setores));
  }
  if (input.responsaveis !== undefined) {
    data.responsaveisJson = serializeStringArray(normalizeEmails(input.responsaveis));
  }
  if (input.status !== undefined && VALID_STATUS.has(input.status)) {
    data.status = input.status;
    if (input.status === "fechado") {
      data.fechadoPorEmail = ctx.email;
      data.fechadoPorNome = ctx.displayName;
      data.fechadoEm = new Date();
    } else {
      data.fechadoPorEmail = null;
      data.fechadoPorNome = null;
      data.fechadoEm = null;
    }
  }

  const row = await prisma.chamado.update({ where: { id }, data });
  const view = chamadoToView(row);

  let notifyKind: ChamadoNotifyKind | null = null;
  if (input.notificar === false) {
    notifyKind = null;
  } else if (input.notificar === true) {
    notifyKind = resolveChamadoNotifyOnUpdate(existing, input);
    if (input.status === "fechado" && existing.status !== "fechado") {
      notifyKind = "closed";
    } else if (!notifyKind) {
      notifyKind = "updated";
    }
  } else {
    notifyKind = resolveChamadoNotifyOnUpdate(existing, input);
  }

  if (notifyKind) {
    try {
      await notifyChamadoEmail(view, notifyKind);
    } catch (e) {
      console.error(
        "[chamadoService] falha e-mail pós-atualização",
        view.id,
        notifyKind,
        e instanceof Error ? e.message : e,
      );
    }
    try {
      const inboxKind =
        notifyKind === "closed" ? "closed"
        : notifyKind === "created" ? "created"
        : "updated";
      await bumpChamadoInbox(view, { kind: inboxKind, actorEmail: ctx.email });
    } catch (e) {
      console.error("[chamadoService] inbox update", view.id, e);
    }
  }

  return view;
}

export async function resendChamadoNotifyEmail(id: string): Promise<ChamadoView> {
  const row = await prisma.chamado.findUnique({ where: { id } });
  if (!row) throw new Error("not_found");
  const view = chamadoToView(row);
  await notifyChamadoEmail(view, "updated");
  return view;
}

export function parsePrioridade(raw: unknown): ChamadoPrioridade | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase() as ChamadoPrioridade;
  return VALID_PRIORIDADES.has(v) ? v : null;
}

export function parseStatus(raw: unknown): ChamadoStatus | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase() as ChamadoStatus;
  return VALID_STATUS.has(v) ? v : null;
}

export function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}
