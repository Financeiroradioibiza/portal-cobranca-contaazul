"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChamadoPrioridade, ChamadoStatus } from "@prisma/client";
import {
  CHAMADO_COLUNAS,
  CHAMADO_PRIORIDADES,
  CHAMADO_SETORES,
  prioridadeMeta,
  setorMeta,
} from "@/lib/chamados/chamadoConstants";
import type { ChamadoParticipant, ChamadosResumoView, ChamadoView } from "@/lib/chamados/chamadoTypes";
import {
  CHAMADO_VINCULO_VAZIO,
  ChamadoProducaoVinculoFields,
  type ChamadoVinculoState,
} from "@/components/chamados/ChamadoProducaoVinculoFields";
import { ChamadoAnexosBlock } from "@/components/chamados/ChamadoAnexosBlock";
import { ChamadoComentariosBlock } from "@/components/chamados/ChamadoComentariosBlock";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";

type FilterTab = "todos" | "abertos" | "fechados";

function fmtWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0]![0]! + p[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function parseChamados(data: unknown): ChamadoView[] {
  if (!data || typeof data !== "object" || !("chamados" in data)) return [];
  const rows = (data as { chamados?: unknown }).chamados;
  return Array.isArray(rows) ? (rows as ChamadoView[]) : [];
}

function parseParticipants(data: unknown): ChamadoParticipant[] {
  if (!data || typeof data !== "object" || !("participants" in data)) return [];
  const rows = (data as { participants?: unknown }).participants;
  return Array.isArray(rows) ? (rows as ChamadoParticipant[]) : [];
}

const PRI_WEIGHT: Record<ChamadoPrioridade, number> = {
  urgente: 4,
  alta: 3,
  media: 2,
  baixa: 1,
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function sortCards(a: ChamadoView, b: ChamadoView): number {
  const ua = a.unreadCount ?? 0;
  const ub = b.unreadCount ?? 0;
  if (ub !== ua) return ub - ua;
  const pw = PRI_WEIGHT[b.prioridade] - PRI_WEIGHT[a.prioridade];
  if (pw !== 0) return pw;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

type ChamadosBoardProps = {
  /** Quando "mine", carrega só chamados em que o usuário ou setor participa. */
  scope?: "all" | "mine";
  /** Layout compacto para embutir no dashboard (sem banner grande). */
  embedded?: boolean;
  /** Dentro do workspace (sem banner duplicado da página). */
  embeddedLayout?: boolean;
  /** Abrir detalhe ao carregar (link do e-mail). */
  initialChamadoId?: string | null;
  refreshToken?: number;
};

export function ChamadosBoard({
  scope = "all",
  embedded = false,
  embeddedLayout = false,
  initialChamadoId = null,
  refreshToken = 0,
}: ChamadosBoardProps) {
  const [chamados, setChamados] = useState<ChamadoView[]>([]);
  const [participants, setParticipants] = useState<ChamadoParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("abertos");
  const [selected, setSelected] = useState<ChamadoView | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewerEmail, setViewerEmail] = useState("");
  const [resumo, setResumo] = useState<ChamadosResumoView | null>(null);

  const [formTitulo, setFormTitulo] = useState("");
  const [formTituloManual, setFormTituloManual] = useState(false);
  const [formVinculo, setFormVinculo] = useState<ChamadoVinculoState>(CHAMADO_VINCULO_VAZIO);
  const [formDesc, setFormDesc] = useState("");
  const [formPri, setFormPri] = useState<ChamadoPrioridade>("media");
  const [formSetores, setFormSetores] = useState<string[]>([]);
  const [formResp, setFormResp] = useState<string[]>([]);
  const [formCreateFiles, setFormCreateFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const chamadosUrl =
        scope === "mine" ? "/api/chamados?scope=mine-all" : "/api/chamados";
      const [cRes, pRes] = await Promise.all([
        fetch(chamadosUrl, { credentials: "same-origin" }),
        fetch("/api/chamados/participants", { credentials: "same-origin" }),
      ]);
      const cData = cRes.ok ? await cRes.json() : null;
      const pData = pRes.ok ? await pRes.json() : null;
      setChamados(parseChamados(cData));
      const r = (cData as { resumo?: ChamadosResumoView })?.resumo;
      setResumo(r && typeof r === "object" ? r : null);
      setParticipants(parseParticipants(pData));
    } catch {
      setMsg("Não foi possível carregar os chamados.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshToken <= 0) return;
    void load();
  }, [refreshToken, load]);

  useEffect(() => {
    void fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.email === "string") setViewerEmail(d.email);
      })
      .catch(() => {});
  }, []);

  const openChamado = useCallback((c: ChamadoView) => {
    setSelected(c);
    if ((c.unreadCount ?? 0) > 0) {
      void fetch(`/api/chamados/${encodeURIComponent(c.id)}/read`, {
        method: "POST",
        credentials: "same-origin",
      }).then(() => {
        setChamados((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, unreadCount: 0 } : x)),
        );
        setResumo((prev) =>
          prev ?
            {
              ...prev,
              chamadosNaoLidos: Math.max(0, prev.chamadosNaoLidos - (c.unreadCount ?? 0)),
            }
          : prev,
        );
      });
    }
  }, []);

  useEffect(() => {
    if (!initialChamadoId || loading) return;
    const c = chamados.find((x) => x.id === initialChamadoId);
    if (c) openChamado(c);
  }, [initialChamadoId, chamados, loading, openChamado]);

  const filtered = useMemo(() => {
    let list = chamados;
    if (filter === "abertos") {
      list = list.filter((c) => c.status === "aberto" || c.status === "em_andamento");
    } else if (filter === "fechados") {
      list = list.filter((c) => c.status === "fechado");
    }
    return list;
  }, [chamados, filter]);

  const byColumn = useMemo(() => {
    const map: Record<ChamadoStatus, ChamadoView[]> = {
      aberto: [],
      em_andamento: [],
      fechado: [],
    };
    for (const c of filtered) {
      map[c.status].push(c);
    }
    for (const k of Object.keys(map) as ChamadoStatus[]) {
      map[k].sort(sortCards);
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const abertos = chamados.filter((c) => c.status !== "fechado").length;
    const fechados = chamados.filter((c) => c.status === "fechado").length;
    return { total: chamados.length, abertos, fechados };
  }, [chamados]);

  async function resendChamadoEmail(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/chamados/${id}`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setMsg("Não foi possível reenviar o e-mail do chamado.");
        return;
      }
      setMsg("Notificação por e-mail enfileirada (setores + responsáveis atuais).");
    } catch {
      setMsg("Erro de rede ao reenviar e-mail.");
    } finally {
      setBusy(false);
    }
  }

  async function patchChamado(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/chamados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível atualizar o chamado.");
        return;
      }
      const updated = (data as { chamado?: ChamadoView }).chamado;
      if (updated) {
        setChamados((prev) =>
          prev.map((c) =>
            c.id === updated.id ? { ...updated, unreadCount: c.unreadCount ?? 0 } : c,
          ),
        );
        setSelected((prev) =>
          prev?.id === updated.id ? { ...updated, unreadCount: prev.unreadCount ?? 0 } : prev,
        );
      } else {
        await load();
      }
      if (body.notificar === true) {
        setMsg("Chamado salvo. E-mail enviado para setores, responsáveis e quem abriu o chamado.");
      } else {
        setMsg("Alterações salvas (sem novo e-mail).");
      }
    } catch {
      setMsg("Erro de rede ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function createChamado() {
    if (formVinculo.modo === "cliente" && !formVinculo.clienteKey) {
      setMsg("Selecione um cliente da produção ou use «Assunto livre».");
      return;
    }
    if (formVinculo.modo === "pdv" && !formVinculo.pdvKey) {
      setMsg("Selecione um PDV da produção ou use «Assunto livre».");
      return;
    }
    if (!formTitulo.trim()) {
      setMsg("Informe o assunto do chamado.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/chamados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          titulo: formTitulo,
          descricao: formDesc,
          prioridade: formPri,
          setores: formSetores,
          responsaveis: formResp,
          rioLinhaId: formVinculo.rioLinhaId,
          rioPdvKey: formVinculo.rioPdvKey,
          clienteNome: formVinculo.clienteNome,
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível criar o chamado.");
        return;
      }
      const created = (data as { chamado?: ChamadoView }).chamado;
      if (created) {
        setChamados((prev) => [created, ...prev]);
        for (const file of formCreateFiles) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("comentarioId", "initial");
          await fetch(`/api/chamados/${encodeURIComponent(created.id)}/anexos`, {
            method: "POST",
            credentials: "same-origin",
            body: fd,
          });
        }
      }
      setCreating(false);
      setFormCreateFiles([]);
      setFormTitulo("");
      setFormTituloManual(false);
      setFormVinculo(CHAMADO_VINCULO_VAZIO);
      setFormDesc("");
      setFormPri("media");
      setFormSetores([]);
      setFormResp([]);
    } catch {
      setMsg("Erro de rede ao criar.");
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setCreating(true);
    setSelected(null);
    setFormTitulo("");
    setFormTituloManual(false);
    setFormVinculo(CHAMADO_VINCULO_VAZIO);
    setFormDesc("");
    setFormPri("media");
    setFormSetores([]);
    setFormResp([]);
    setFormCreateFiles([]);
  }

  function toggleSetor(id: string) {
    setFormSetores((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleResp(email: string) {
    setFormResp((prev) => (prev.includes(email) ? prev.filter((x) => x !== email) : [...prev, email]));
  }

  const title = scope === "mine" ? "Seus chamados" : "Quadro de chamados";
  const subtitle =
    scope === "mine" ?
      "Chamados em que você ou seu setor participa."
    : "Comunicação interna entre setores e pessoas — estilo kanban, simples e colorido.";

  const visibleColumns = useMemo(() => {
    if (filter === "fechados") return CHAMADO_COLUNAS.filter((c) => c.id === "fechado");
    if (filter === "abertos") return CHAMADO_COLUNAS.filter((c) => c.id !== "fechado");
    return CHAMADO_COLUNAS;
  }, [filter]);

  return (
    <div className="space-y-4">
      {embeddedLayout ?
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatPill label="Abertos" value={stats.abertos} tone="sky" />
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              title="Recarregar quadro"
            >
              {loading ? "…" : "↻ Atualizar"}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500"
            >
              + Novo chamado
            </button>
          </div>
        </div>
      : embedded ?
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatPill label="Total" value={stats.total} tone="slate" />
            <StatPill label="Abertos" value={stats.abertos} tone="sky" />
            <StatPill label="Resolvidos" value={stats.fechados} tone="emerald" />
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              {loading ? "…" : "↻ Atualizar"}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              + Novo chamado
            </button>
          </div>
        </div>
      : <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-100 via-sky-50 to-emerald-50 p-4 dark:border-violet-900/50 dark:from-violet-950/40 dark:via-sky-950/30 dark:to-emerald-950/30">
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatPill label="Total" value={stats.total} tone="slate" />
            <StatPill label="Abertos" value={stats.abertos} tone="sky" />
            <StatPill label="Resolvidos" value={stats.fechados} tone="emerald" />
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="rounded-lg border border-violet-300 bg-white/90 px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-white disabled:opacity-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-100"
            >
              {loading ? "…" : "↻ Atualizar"}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-violet-500 hover:to-fuchsia-500"
            >
              + Novo chamado
            </button>
          </div>
        </div>
      }

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "todos" as const, label: "Todos" },
            { id: "abertos" as const, label: "Em aberto" },
            { id: "fechados" as const, label: "Histórico" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={
              "rounded-full px-3 py-1 text-xs font-semibold transition " +
              (filter === tab.id ?
                "bg-violet-600 text-white shadow-sm"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {resumo && (resumo.chamadosNaoLidos > 0 || resumo.conversasMencoes > 0 || resumo.conversasNaoLidas > 0) ?
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
          {resumo.chamadosNaoLidos > 0 ?
            <span className="font-semibold">{resumo.chamadosNaoLidos} não lido(s) em chamados</span>
          : null}
          {resumo.chamadosNaoLidos > 0 && (resumo.conversasNaoLidas > 0 || resumo.conversasMencoes > 0) ?
            " · "
          : null}
          {resumo.conversasMencoes > 0 ?
            <span>{resumo.conversasMencoes} menção(ões) no chat</span>
          : resumo.conversasNaoLidas > 0 ?
            <span>{resumo.conversasNaoLidas} mensagem(ns) no chat</span>
          : null}
        </p>
      : null}

      {msg ?
        <p className="text-sm text-rose-600 dark:text-rose-400">{msg}</p>
      : null}
      {loading ?
        <p className="text-sm text-slate-500">Carregando quadro…</p>
      : null}

      <div
        className={
          "grid gap-4 " +
          (visibleColumns.length === 1 ? "lg:grid-cols-1" : visibleColumns.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3")
        }
      >
        {visibleColumns.map((col) => (
          <div
            key={col.id}
            className={"flex min-h-[320px] flex-col rounded-xl border-2 " + col.column}
          >
            <div className={"border-b-2 px-4 py-3 " + col.header}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{col.label}</h3>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm dark:bg-slate-900/80 dark:text-slate-300">
                  {byColumn[col.id].length}
                </span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              {byColumn[col.id].length === 0 ?
                <p className="py-8 text-center text-xs text-slate-400">Nenhum chamado aqui</p>
              : byColumn[col.id].map((c) => (
                  <ChamadoCard
                    key={c.id}
                    chamado={c}
                    participants={participants}
                    onOpen={() => openChamado(c)}
                  />
                ))
              }
            </div>
          </div>
        ))}
      </div>

      {creating ?
        <FormModal
          title="Novo chamado"
          busy={busy}
          titulo={formTitulo}
          tituloManual={formTituloManual}
          vinculo={formVinculo}
          descricao={formDesc}
          prioridade={formPri}
          setores={formSetores}
          responsaveis={formResp}
          participants={participants}
          onTitulo={setFormTitulo}
          onTituloManual={setFormTituloManual}
          onVinculo={setFormVinculo}
          onDesc={setFormDesc}
          onPri={setFormPri}
          onToggleSetor={toggleSetor}
          onToggleResp={toggleResp}
          pendingFiles={formCreateFiles}
          onPendingFiles={setFormCreateFiles}
          onClose={() => setCreating(false)}
          onSubmit={createChamado}
          submitLabel="Abrir chamado"
        />
      : null}

      {selected ?
        <DetailModal
          chamado={selected}
          busy={busy}
          participants={participants}
          viewerEmail={viewerEmail}
          onClose={() => setSelected(null)}
          onPatch={patchChamado}
          onResendEmail={() => void resendChamadoEmail(selected.id)}
        />
      : null}
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "sky" | "emerald";
}) {
  const tones = {
    slate: "bg-white text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700",
    sky: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
    emerald:
      "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  };
  return (
    <span className={"rounded-lg px-2.5 py-1 text-xs font-bold ring-1 " + tones[tone]}>
      {label}: {value}
    </span>
  );
}

function ChamadoCard({
  chamado,
  participants,
  onOpen,
}: {
  chamado: ChamadoView;
  participants: ChamadoParticipant[];
  onOpen: () => void;
}) {
  const pri = prioridadeMeta(chamado.prioridade);
  const unread = chamado.unreadCount ?? 0;
  const byEmail = useMemo(() => {
    const m = new Map<string, ChamadoParticipant>();
    for (const p of participants) m.set(p.email.toLowerCase(), p);
    return m;
  }, [participants]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "group relative w-full rounded-lg border border-slate-200/90 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 " +
        "ring-1 ring-transparent hover:ring-violet-300 dark:hover:ring-violet-700" +
        (unread > 0 ? " border-violet-400 ring-violet-200 dark:border-violet-600" : "")
      }
    >
      {unread > 0 ?
        <span className="absolute right-2 top-2 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      : null}
      <div className="mb-2 flex items-start gap-2">
        <span className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full " + pri.dot} title={pri.label} />
        <p className="line-clamp-2 flex-1 pr-8 text-sm font-semibold text-slate-900 dark:text-white">
          {chamado.titulo}
        </p>
      </div>
      {chamado.descricao ?
        <p className="mb-2 line-clamp-2 text-xs text-slate-500">{chamado.descricao}</p>
      : null}
      {chamado.clienteNome?.trim() || chamado.rioPdvKey ?
        <p className="mb-2 truncate text-[10px] font-medium text-violet-600 dark:text-violet-300">
          {chamado.clienteNome?.trim() || "Cliente"}
          {chamado.rioPdvKey ? " · PDV" : ""}
        </p>
      : null}
      <div className="mb-2 flex flex-wrap gap-1">
        {chamado.setores.map((s) => {
          const m = setorMeta(s);
          return (
            <span key={s} className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + m.bg}>
              {m.label}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
        <span className="truncate">por {chamado.criadoPorNome}</span>
        <span className="shrink-0">{fmtWhen(chamado.updatedAt)}</span>
      </div>
      {chamado.responsaveis.length > 0 ?
        <div className="mt-2 flex -space-x-1">
          {chamado.responsaveis.slice(0, 4).map((email) => {
            const p = byEmail.get(email.toLowerCase());
            return (
              <span key={email} title={email} className="ring-2 ring-white dark:ring-slate-900">
                <PortalUserAvatar
                  userId={p?.userId}
                  displayName={p?.displayName ?? email.split("@")[0] ?? email}
                  email={email}
                  hasAvatar={p?.hasAvatar}
                  avatarVersion={p?.avatarVersion}
                  size="xs"
                />
              </span>
            );
          })}
        </div>
      : null}
    </button>
  );
}

function FormModal({
  title,
  busy,
  titulo,
  tituloManual,
  vinculo,
  descricao,
  prioridade,
  setores,
  responsaveis,
  participants,
  onTitulo,
  onTituloManual,
  onVinculo,
  onDesc,
  onPri,
  onToggleSetor,
  onToggleResp,
  pendingFiles,
  onPendingFiles,
  onClose,
  onSubmit,
  submitLabel,
}: {
  title: string;
  busy: boolean;
  titulo: string;
  tituloManual: boolean;
  vinculo: ChamadoVinculoState;
  descricao: string;
  prioridade: ChamadoPrioridade;
  setores: string[];
  responsaveis: string[];
  participants: ChamadoParticipant[];
  onTitulo: (v: string) => void;
  onTituloManual: (v: boolean) => void;
  onVinculo: (v: ChamadoVinculoState) => void;
  onDesc: (v: string) => void;
  onPri: (v: ChamadoPrioridade) => void;
  onToggleSetor: (id: string) => void;
  onToggleResp: (email: string) => void;
  pendingFiles: File[];
  onPendingFiles: (files: File[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <ChamadoProducaoVinculoFields
        vinculo={vinculo}
        titulo={titulo}
        tituloManual={tituloManual}
        onVinculoChange={onVinculo}
        onTituloChange={onTitulo}
        onTituloManualChange={onTituloManual}
      />
      <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-400">
        Descrição
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          rows={4}
          value={descricao}
          onChange={(e) => onDesc(e.target.value)}
          placeholder="Detalhes do que precisa ser feito…"
        />
      </label>
      <div className="mt-2">
        <label className="cursor-pointer text-xs font-semibold text-violet-700 dark:text-violet-300">
          + Anexar imagem ou MP3 ao pedido
          <input
            type="file"
            className="hidden"
            multiple
            accept="image/*,audio/*,.mp3,audio/mpeg"
            onChange={(e) => {
              const list = e.target.files ? [...e.target.files] : [];
              if (list.length) onPendingFiles([...pendingFiles, ...list]);
              e.target.value = "";
            }}
          />
        </label>
        {pendingFiles.length > 0 ?
          <p className="mt-1 text-[10px] text-slate-500">{pendingFiles.map((f) => f.name).join(", ")}</p>
        : null}
      </div>
      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Prioridade</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {CHAMADO_PRIORIDADES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPri(p.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-2 transition " +
                (prioridade === p.id ?
                  "bg-white ring-offset-1 " + p.ring
                : "bg-slate-100 ring-transparent dark:bg-slate-800")
              }
            >
              <span className={"h-2 w-2 rounded-full " + p.dot} />
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Setores</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {CHAMADO_SETORES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggleSetor(s.id)}
              className={
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
                (setores.includes(s.id) ? s.bg + " ring-2 ring-violet-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {participants.length > 0 ?
        <div className="mt-3 max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Pessoas</p>
          <div className="mt-1 space-y-1">
            {participants.map((p) => (
              <label
                key={p.email}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={responsaveis.includes(p.email)}
                  onChange={() => onToggleResp(p.email)}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-sm">{p.displayName}</span>{" "}
                  <span className="text-[10px] text-slate-400">{p.email}</span>
                </span>
                <span className="text-[10px] text-slate-400">{p.profileName}</span>
              </label>
            ))}
          </div>
        </div>
      : null}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSubmit}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
        >
          {busy ? "Salvando…" : submitLabel}
        </button>
      </div>
    </ModalShell>
  );
}

function DetailModal({
  chamado,
  busy,
  participants,
  viewerEmail,
  onClose,
  onPatch,
  onResendEmail,
}: {
  chamado: ChamadoView;
  busy: boolean;
  participants: ChamadoParticipant[];
  viewerEmail: string;
  onClose: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
  onResendEmail: () => void;
}) {
  const [prioridade, setPrioridade] = useState(chamado.prioridade);
  const [setores, setSetores] = useState(chamado.setores);
  const [responsaveis, setResponsaveis] = useState(chamado.responsaveis);
  const [editMeta, setEditMeta] = useState(false);

  useEffect(() => {
    setPrioridade(chamado.prioridade);
    setSetores(chamado.setores);
    setResponsaveis(chamado.responsaveis);
    setEditMeta(false);
  }, [chamado]);

  const pri = prioridadeMeta(prioridade);
  const col = CHAMADO_COLUNAS.find((c) => c.id === chamado.status);
  const metaDirty =
    prioridade !== chamado.prioridade ||
    !arraysEqual(setores, chamado.setores) ||
    !arraysEqual(responsaveis, chamado.responsaveis);

  const byEmail = useMemo(() => {
    const m = new Map<string, ChamadoParticipant>();
    for (const p of participants) m.set(p.email.toLowerCase(), p);
    return m;
  }, [participants]);

  return (
    <ModalShell title="Chamado" onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
        <span className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold " + (col?.header ?? "")}>
          {col?.label ?? chamado.status}
        </span>
        <span className={"inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold " + pri.dot.replace("bg-", "text-")}>
          <span className={"h-2 w-2 rounded-full " + pri.dot} />
          {pri.label}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 dark:text-white">{chamado.titulo}</h3>
        <div className="flex shrink-0 items-center -space-x-1.5">
          {responsaveis.slice(0, 6).map((email) => {
            const p = byEmail.get(email.toLowerCase());
            return (
              <span key={email} title={email} className="ring-2 ring-white dark:ring-slate-900">
                <PortalUserAvatar
                  userId={p?.userId}
                  displayName={p?.displayName ?? email.split("@")[0] ?? email}
                  email={email}
                  hasAvatar={p?.hasAvatar}
                  avatarVersion={p?.avatarVersion}
                  size="xs"
                />
              </span>
            );
          })}
        </div>
        <button
          type="button"
          className="shrink-0 text-[11px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
          onClick={() => setEditMeta((v) => !v)}
        >
          {editMeta ? "Fechar" : "Editar"}
        </button>
      </div>

      {editMeta ?
        <div className="mb-3 space-y-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Prioridade</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHAMADO_PRIORIDADES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrioridade(p.id)}
                  className={
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                    (prioridade === p.id ? "ring-2 " + p.ring : "opacity-60")
                  }
                >
                  <span className={"h-2 w-2 rounded-full " + p.dot} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">Setores</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {CHAMADO_SETORES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setSetores((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                  }
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                    (setores.includes(s.id) ? s.bg : "bg-slate-100 opacity-50")
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {participants.length > 0 ?
            <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-900">
              <p className="text-[10px] font-bold uppercase text-slate-500">Pessoas envolvidas</p>
              {participants.map((p) => (
                <label key={p.email} className="flex items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={responsaveis.includes(p.email)}
                    onChange={() =>
                      setResponsaveis((prev) =>
                        prev.includes(p.email) ? prev.filter((x) => x !== p.email) : [...prev, p.email],
                      )
                    }
                  />
                  <PortalUserAvatar
                    userId={p.userId}
                    displayName={p.displayName}
                    email={p.email}
                    hasAvatar={p.hasAvatar}
                    avatarVersion={p.avatarVersion}
                    size="xs"
                  />
                  <span className="truncate">{p.displayName}</span>
                </label>
              ))}
            </div>
          : null}
        </div>
      : null}

      {chamado.clienteNome?.trim() ?
        <p className="mb-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
          <span className="font-semibold">Produção:</span> {chamado.clienteNome}
          {chamado.rioPdvKey ? " · PDV vinculado" : ""}
        </p>
      : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40">
        <p className="text-[10px] font-bold uppercase text-slate-500">
          Pedido inicial · {chamado.criadoPorNome} · {fmtWhen(chamado.createdAt)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
          {chamado.descricao || "—"}
        </p>
        <ChamadoAnexosBlock chamadoId={chamado.id} scope="initial" compact label="Anexos do pedido" />
      </div>

      <ChamadoComentariosBlock
        chamadoId={chamado.id}
        viewerEmail={viewerEmail}
        participants={participants}
        onReplySent={onClose}
      />

      <p className="mt-2 text-[11px] text-slate-500">
        {chamado.fechadoEm ?
          <>Fechado por {chamado.fechadoPorNome} em {fmtWhen(chamado.fechadoEm)}</>
        : null}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onResendEmail}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          Reenviar e-mail
        </button>
        {chamado.status !== "aberto" ?
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPatch(chamado.id, { status: "aberto", notificar: true })}
            className="rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-200"
          >
            Reabrir
          </button>
        : null}
        {chamado.status === "aberto" ?
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPatch(chamado.id, { status: "em_andamento", notificar: true })}
            className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
          >
            Em andamento
          </button>
        : null}
        {chamado.status !== "fechado" ?
          <button
            type="button"
            disabled={busy}
            onClick={() => void onPatch(chamado.id, { status: "fechado", notificar: true })}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Resolver / fechar
          </button>
        : null}
        <button
          type="button"
          disabled={busy || !metaDirty}
          title={metaDirty ? "Salva prioridade, setores e pessoas (sem e-mail)" : "Nenhuma alteração pendente"}
          onClick={() =>
            void onPatch(chamado.id, {
              prioridade,
              setores,
              responsaveis,
              notificar: false,
            }).then(() => setEditMeta(false))
          }
          className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
        >
          Salvar alterações
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
