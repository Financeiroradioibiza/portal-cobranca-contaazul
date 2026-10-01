"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { ChamadoMentionTextarea } from "@/components/chamados/ChamadoMentionTextarea";
import { ConversaChatMessage } from "@/components/chamados/ConversaChatMessage";
import { ConversaGrupoMembros } from "@/components/chamados/ConversaGrupoMembros";
import { ConversaInboxSection } from "@/components/chamados/ConversaInboxSection";
import { ConversaUnreadBadges } from "@/components/chamados/ConversaUnreadBadges";
import type { ConversaReacaoView } from "@/lib/chamados/conversaMessageService";

export type ConversaAssuntoListItem = {
  id: string;
  slug: string;
  titulo: string;
  display: string;
  unreadCount: number;
  unreadGeneralCount?: number;
  unreadMentionCount?: number;
  mentionUnread: boolean;
  lastMessagePreview: string | null;
};

export type ConversaMensagemItem = {
  id: string;
  corpo: string;
  autorNome: string;
  autorEmail: string;
  createdAt: string;
  anexos: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
  replyTo: { id: string; autorNome: string; corpo: string } | null;
  reacoes: ConversaReacaoView[];
  favorito: boolean;
  naoLida: boolean;
};

type InboxClienteCanalRow = {
  papel: "sup" | "mus";
  label: string;
  assuntoId: string | null;
  assuntoSlug: string | null;
  unreadGeneral: number;
  unreadMention: number;
  lastMessagePreview: string | null;
};

type InboxClienteRow = {
  clienteKey: string;
  nome: string;
  unreadGeneral: number;
  unreadMention: number;
  canais: InboxClienteCanalRow[];
};

type InboxData = {
  urgentes: {
    mensagemId: string;
    assuntoId: string;
    assuntoDisplay: string;
    assuntoSlug: string;
    corpoPreview: string;
    autorNome: string;
    createdAt: string;
  }[];
  minhasEnviadas: {
    mensagemId: string;
    assuntoId: string;
    assuntoDisplay: string;
    assuntoSlug: string;
    corpoPreview: string;
    createdAt: string;
  }[];
  canais: ConversaAssuntoListItem[];
  prospects: ConversaAssuntoListItem[];
  clientes: InboxClienteRow[];
};

function assuntoToListItem(a: ConversaAssuntoListItem): ConversaAssuntoListItem {
  return a;
}

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

function assuntoToListItemFromApi(raw: {
  id: string;
  slug: string;
  titulo?: string;
  display: string;
  unreadCount?: number;
  unreadGeneralCount?: number;
  unreadMentionCount?: number;
  mentionUnread?: boolean;
  lastMessagePreview?: string | null;
}): ConversaAssuntoListItem {
  return {
    id: raw.id,
    slug: raw.slug,
    titulo: raw.titulo ?? raw.display,
    display: raw.display,
    unreadCount: raw.unreadCount ?? 0,
    unreadGeneralCount: raw.unreadGeneralCount ?? 0,
    unreadMentionCount: raw.unreadMentionCount ?? 0,
    mentionUnread: raw.mentionUnread ?? false,
    lastMessagePreview: raw.lastMessagePreview ?? null,
  };
}

type Props = {
  selectedId: string | null;
  /** Mantém o chat estável enquanto o inbox recarrega. */
  selectedItem?: ConversaAssuntoListItem | null;
  onSelect: (assunto: ConversaAssuntoListItem | null) => void;
  participants: ChamadoParticipant[];
  viewerEmail?: string;
  /** slug da URL ?conversa= */
  initialSlug?: string | null;
  /** Oculta o painel de chat (só coluna # visível). */
  hideChat?: boolean;
  refreshToken?: number;
};

export function ChamadosConversasPanel({
  selectedId,
  selectedItem = null,
  onSelect,
  participants,
  viewerEmail = "",
  initialSlug,
  hideChat = false,
  refreshToken = 0,
}: Props) {
  /** Mantém título/id mesmo se o inbox recarregar antes do mapa interno. */
  const [stickySelected, setStickySelected] = useState<ConversaAssuntoListItem | null>(null);
  const [inbox, setInbox] = useState<InboxData | null>(null);
  const [assuntos, setAssuntos] = useState<ConversaAssuntoListItem[]>([]);
  const [clienteFilter, setClienteFilter] = useState("");
  const [expandedClienteKey, setExpandedClienteKey] = useState<string | null>(null);
  const [expandedMinhasAssuntoIds, setExpandedMinhasAssuntoIds] = useState<Set<string>>(() => new Set());
  const [sectionsOpen, setSectionsOpen] = useState({
    urgentes: true,
    canais: true,
    prospects: false,
    minhas: false,
    clientes: true,
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingProspect, setCreatingProspect] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newProspectNome, setNewProspectNome] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<ConversaMensagemItem[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ConversaMensagemItem | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [grupoEmails, setGrupoEmails] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSlugHandled = useRef(false);

  const loadInbox = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/chamados/conversas/inbox", { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      const box = (data as { inbox?: InboxData })?.inbox;
      if (box) {
        setInbox(box);
        setAssuntos(box.canais);
      } else if (!opts?.silent) {
        setInbox(null);
        setAssuntos([]);
      }
    } catch {
      if (!opts?.silent) {
        setInbox(null);
        setAssuntos([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const allAssuntos = useMemo(() => {
    const map = new Map<string, ConversaAssuntoListItem>();
    for (const a of assuntos) map.set(a.id, a);
    if (inbox) {
      for (const p of inbox.prospects ?? []) map.set(p.id, assuntoToListItem(p));
      for (const c of inbox.clientes) {
        for (const ch of c.canais) {
          if (!ch.assuntoId) continue;
          map.set(ch.assuntoId, {
            id: ch.assuntoId,
            slug: ch.assuntoSlug ?? "",
            titulo: c.nome,
            display: ch.label,
            unreadCount: ch.unreadGeneral + ch.unreadMention,
            unreadGeneralCount: ch.unreadGeneral,
            unreadMentionCount: ch.unreadMention,
            mentionUnread: ch.unreadMention > 0,
            lastMessagePreview: ch.lastMessagePreview,
          });
        }
      }
      for (const m of inbox.minhasEnviadas ?? []) {
        if (map.has(m.assuntoId)) continue;
        map.set(m.assuntoId, {
          id: m.assuntoId,
          slug: m.assuntoSlug,
          titulo: m.assuntoDisplay,
          display: m.assuntoDisplay,
          unreadCount: 0,
          unreadGeneralCount: 0,
          unreadMentionCount: 0,
          mentionUnread: false,
          lastMessagePreview: m.corpoPreview,
        });
      }
    }
    return map;
  }, [assuntos, inbox]);

  const minhasEnviadasGrupos = useMemo(() => {
    const items = inbox?.minhasEnviadas ?? [];
    const byAssunto = new Map<string, InboxData["minhasEnviadas"]>();
    for (const m of items) {
      const list = byAssunto.get(m.assuntoId) ?? [];
      list.push(m);
      byAssunto.set(m.assuntoId, list);
    }
    return [...byAssunto.entries()]
      .map(([assuntoId, mensagens]) => {
        const sorted = [...mensagens].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const head = sorted[0]!;
        return {
          assuntoId,
          assuntoDisplay: head.assuntoDisplay,
          assuntoSlug: head.assuntoSlug,
          mensagens: sorted,
        };
      })
      .sort((a, b) =>
        (b.mensagens[0]?.createdAt ?? "").localeCompare(a.mensagens[0]?.createdAt ?? ""),
      );
  }, [inbox?.minhasEnviadas]);

  function toggleMinhasAssunto(assuntoId: string) {
    setExpandedMinhasAssuntoIds((prev) => {
      const next = new Set(prev);
      if (next.has(assuntoId)) next.delete(assuntoId);
      else next.add(assuntoId);
      return next;
    });
  }

  useEffect(() => {
    if (selectedItem?.id) setStickySelected(selectedItem);
  }, [selectedItem]);

  useEffect(() => {
    if (!selectedId) setStickySelected(null);
  }, [selectedId]);

  const activeAssunto = useMemo(() => {
    if (!selectedId) return null;
    const hit = allAssuntos.get(selectedId);
    if (hit) return hit;
    if (selectedItem?.id === selectedId) return selectedItem;
    if (stickySelected?.id === selectedId) return stickySelected;
    const slugHint = initialSlug ?? stickySelected?.slug ?? selectedItem?.slug ?? "";
    const displayHint =
      stickySelected?.display ??
      selectedItem?.display ??
      (slugHint ?
        slugHint.startsWith("#") ?
          slugHint
        : `#${slugHint}`
      : "Conversa");
    return {
      id: selectedId,
      slug: slugHint || selectedId,
      titulo: displayHint,
      display: displayHint,
      unreadCount: 0,
      unreadGeneralCount: 0,
      unreadMentionCount: 0,
      mentionUnread: false,
      lastMessagePreview: null,
    };
  }, [allAssuntos, selectedId, selectedItem, stickySelected, initialSlug]);

  const chatOpen = Boolean(selectedId && !hideChat);

  function pickAssunto(a: ConversaAssuntoListItem | null) {
    if (a) setStickySelected(a);
    else setStickySelected(null);
    onSelect(a);
  }

  const clientesFiltrados = useMemo(() => {
    if (!inbox) return [];
    const q = clienteFilter.trim().toLowerCase();
    if (!q) return inbox.clientes;
    return inbox.clientes.filter((c) => c.nome.toLowerCase().includes(q));
  }, [inbox, clienteFilter]);

  const loadMensagens = useCallback(async (assuntoId: string) => {
    try {
      const res = await fetch(`/api/chamados/conversas/${assuntoId}/mensagens`, { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      const rows = (data as { mensagens?: ConversaMensagemItem[] })?.mensagens;
      setMensagens(Array.isArray(rows) ? rows : []);
    } catch {
      setMensagens([]);
    }
  }, []);

  useEffect(() => {
    if (hideChat || !selectedId) {
      if (hideChat) setMensagens([]);
      if (!selectedId) setGrupoEmails([]);
      return;
    }
    void loadMensagens(selectedId);
    void fetch(`/api/chamados/conversas/${encodeURIComponent(selectedId)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const emails = (data as { assunto?: { grupoEmails?: string[] } })?.assunto?.grupoEmails;
        setGrupoEmails(Array.isArray(emails) ? emails : []);
      })
      .catch(() => setGrupoEmails([]));
    const iv = setInterval(() => void loadMensagens(selectedId), 15000);
    return () => clearInterval(iv);
  }, [selectedId, loadMensagens, hideChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    if (initialSlugHandled.current || !initialSlug || allAssuntos.size === 0) return;
    const slug = initialSlug.toLowerCase();
    const hit = [...allAssuntos.values()].find((a) => a.slug === slug);
    if (hit) {
      initialSlugHandled.current = true;
      pickAssunto(hit);
    }
  }, [initialSlug, allAssuntos]);

  async function createAssunto() {
    if (!newTitulo.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/chamados/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ titulo: newTitulo.trim() }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg(res.status === 409 ? "Já existe um assunto com esse nome." : "Não foi possível criar.");
        return;
      }
      const created = (data as { assunto?: ConversaAssuntoListItem }).assunto;
      setNewTitulo("");
      if (created) pickAssunto(assuntoToListItemFromApi(created));
      await loadInbox({ silent: true });
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setCreating(false);
    }
  }

  async function sendMessage() {
    if (!selectedId) return;
    if (!draft.trim() && pendingFiles.length === 0) return;
    setChatBusy(true);
    try {
      const fd = new FormData();
      fd.append("corpo", draft);
      if (replyTo) fd.append("replyToMensagemId", replyTo.id);
      for (const f of pendingFiles) fd.append("files", f);
      const res = await fetch(`/api/chamados/conversas/${selectedId}/mensagens`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok) {
        setMsg("Não foi possível enviar a mensagem.");
        return;
      }
      setDraft("");
      setReplyTo(null);
      setPendingFiles([]);
      await loadMensagens(selectedId);
      await loadInbox({ silent: true });
    } catch {
      setMsg("Erro de rede ao enviar.");
    } finally {
      setChatBusy(false);
    }
  }

  async function openClienteCanal(clienteKey: string, papel: "sup" | "mus") {
    setMsg(null);
    try {
      const res = await fetch("/api/chamados/conversas/cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ clienteKey, papel }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível abrir o canal do cliente.");
        return;
      }
      const created = (data as { assunto?: ConversaAssuntoListItem })?.assunto;
      if (created) pickAssunto(assuntoToListItemFromApi(created));
      await loadInbox({ silent: true });
    } catch {
      setMsg("Erro ao abrir cliente.");
    }
  }

  async function createProspect() {
    if (!newProspectNome.trim()) return;
    setCreatingProspect(true);
    setMsg(null);
    try {
      const res = await fetch("/api/chamados/conversas/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ nome: newProspectNome.trim() }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível criar prospect.");
        return;
      }
      setNewProspectNome("");
      setSectionsOpen((s) => ({ ...s, prospects: true }));
      const created = (data as { assunto?: ConversaAssuntoListItem })?.assunto;
      if (created) pickAssunto(assuntoToListItemFromApi(created));
      await loadInbox({ silent: true });
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setCreatingProspect(false);
    }
  }

  async function migrarProspect(prospectId: string) {
    const clienteKey = window.prompt("Chave do cliente no catálogo Produção (clienteKey):");
    if (!clienteKey?.trim()) return;
    const mus = window.confirm("OK = canal Musical (#Mus). Cancelar = Suporte (#Sup).");
    setMsg(null);
    try {
      const res = await fetch(`/api/chamados/conversas/prospect/${encodeURIComponent(prospectId)}/migrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ clienteKey: clienteKey.trim(), papel: mus ? "mus" : "sup" }),
      });
      if (!res.ok) {
        setMsg("Não foi possível mover a conversa para o cliente.");
        return;
      }
      await loadInbox({ silent: true });
    } catch {
      setMsg("Erro ao migrar prospect.");
    }
  }

  function toggleSection(key: keyof typeof sectionsOpen) {
    setSectionsOpen((s) => ({ ...s, [key]: !s[key] }));
  }

  function jumpToMessage(assuntoId: string, mensagemId: string) {
    const a = allAssuntos.get(assuntoId);
    if (a) pickAssunto(a);
    setTimeout(() => {
      document.getElementById("msg-" + mensagemId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
  }

  function voltarParaListaConversas() {
    setReplyTo(null);
    pickAssunto(null);
  }

  async function refreshConversas() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadInbox({ silent: true });
      if (selectedId && !hideChat) {
        await loadMensagens(selectedId);
        const res = await fetch(`/api/chamados/conversas/${encodeURIComponent(selectedId)}`, {
          credentials: "same-origin",
        });
        const data = res.ok ? await res.json() : null;
        const emails = (data as { assunto?: { grupoEmails?: string[] } })?.assunto?.grupoEmails;
        if (Array.isArray(emails)) setGrupoEmails(emails);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (refreshToken <= 0) return;
    void refreshConversas();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só refreshToken (cabeçalho da página)
  }, [refreshToken]);

  function renderListRow(
    key: string,
    label: string,
    sub: string | null,
    general: number,
    mention: number,
    active: boolean,
    onClick: () => void,
  ) {
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        className={
          "flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left transition hover:bg-white dark:border-slate-800 dark:hover:bg-slate-900 " +
          (active ? "bg-white ring-1 ring-inset ring-violet-300 dark:bg-slate-900 dark:ring-violet-700" : "")
        }
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</span>
          {sub ?
            <span className="mt-0.5 block truncate text-[10px] text-slate-400">{sub}</span>
          : null}
        </span>
        <ConversaUnreadBadges general={general} mention={mention} />
      </button>
    );
  }

  const showChatMobile = chatOpen;

  const sidebar = (
      <aside
        className={
          "flex h-full max-h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 md:w-64 md:max-w-[16rem] lg:border-b-0 lg:border-r xl:w-72 " +
          (hideChat ?
            "max-h-[38vh] sm:max-h-full"
          : showChatMobile ?
            "hidden md:flex"
          : "")
        }
      >
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Conversas</p>
            <button
              type="button"
              disabled={refreshing || loading}
              onClick={() => void refreshConversas()}
              className="shrink-0 rounded-lg border border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-900"
              title="Recarregar lista e conversa aberta"
            >
              {refreshing || loading ? "…" : "↻ Atualizar"}
            </button>
          </div>
          <div className="mt-2 flex gap-1">
            <input
              type="text"
              placeholder="Novo canal #"
              value={newTitulo}
              onChange={(e) => setNewTitulo(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createAssunto();
              }}
            />
            <button
              type="button"
              disabled={creating}
              onClick={() => void createAssunto()}
              className="shrink-0 rounded-lg bg-violet-600 px-2 py-1 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              +
            </button>
          </div>
          {msg ?
            <p className="mt-1 text-[10px] text-rose-600">{msg}</p>
          : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {loading ?
            <p className="p-3 text-xs text-slate-400">Carregando…</p>
          : <>
              {inbox && inbox.urgentes.length > 0 ?
                <ConversaInboxSection
                  title="Urgente ★"
                  open={sectionsOpen.urgentes}
                  onToggle={() => toggleSection("urgentes")}
                  count={inbox.urgentes.length}
                  headerClass="bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                >
                  {inbox.urgentes.map((u) =>
                    renderListRow(
                      "u-" + u.mensagemId,
                      u.assuntoDisplay,
                      u.corpoPreview,
                      0,
                      0,
                      false,
                      () => jumpToMessage(u.assuntoId, u.mensagemId),
                    ),
                  )}
                </ConversaInboxSection>
              : null}

              <ConversaInboxSection
                title="Canais #"
                open={sectionsOpen.canais}
                onToggle={() => toggleSection("canais")}
                count={assuntos.length}
              >
                {assuntos.length === 0 ?
                  <p className="px-3 py-2 text-[10px] text-slate-400">Nenhum canal ainda.</p>
                : assuntos.map((a) =>
                    renderListRow(
                      a.id,
                      a.display,
                      a.lastMessagePreview,
                      a.unreadGeneralCount ?? a.unreadCount,
                      a.unreadMentionCount ?? (a.mentionUnread ? 1 : 0),
                      selectedId === a.id,
                      () => pickAssunto(a),
                    ),
                  )
                }
              </ConversaInboxSection>

              <ConversaInboxSection
                title="Prospects"
                open={sectionsOpen.prospects}
                onToggle={() => toggleSection("prospects")}
                count={inbox?.prospects?.length ?? 0}
                headerClass="bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <div className="flex gap-1 px-3 pb-1">
                  <input
                    type="text"
                    placeholder="Novo prospect…"
                    value={newProspectNome}
                    onChange={(e) => setNewProspectNome(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void createProspect();
                    }}
                  />
                  <button
                    type="button"
                    disabled={creatingProspect}
                    onClick={() => void createProspect()}
                    className="rounded bg-amber-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-60"
                  >
                    +
                  </button>
                </div>
                {(inbox?.prospects ?? []).length === 0 ?
                  <p className="px-3 py-2 text-[10px] text-slate-400">Nenhum prospect.</p>
                : (inbox?.prospects ?? []).map((p) => (
                    <div key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                      {renderListRow(
                        p.id,
                        p.display,
                        p.lastMessagePreview,
                        p.unreadGeneralCount ?? p.unreadCount,
                        p.unreadMentionCount ?? 0,
                        selectedId === p.id,
                        () => pickAssunto(p),
                      )}
                      <div className="px-3 pb-2">
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
                          onClick={() => void migrarProspect(p.id)}
                        >
                          Mover conversa para cliente…
                        </button>
                      </div>
                    </div>
                  ))
                }
              </ConversaInboxSection>

              {minhasEnviadasGrupos.length > 0 ?
                <ConversaInboxSection
                  title="Minhas enviadas"
                  open={sectionsOpen.minhas}
                  onToggle={() => toggleSection("minhas")}
                  count={inbox?.minhasEnviadas.length ?? 0}
                  headerClass="bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
                >
                  {minhasEnviadasGrupos.map((g) => {
                    const expanded = expandedMinhasAssuntoIds.has(g.assuntoId);
                    const activeAssunto = selectedId === g.assuntoId;
                    return (
                      <div key={g.assuntoId} className="border-b border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => toggleMinhasAssunto(g.assuntoId)}
                          className={
                            "flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-white dark:hover:bg-slate-900 " +
                            (activeAssunto ? "bg-white dark:bg-slate-900" : "")
                          }
                        >
                          <span className="mt-0.5 text-[10px] text-slate-400">{expanded ? "▾" : "▸"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {g.assuntoDisplay}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {g.mensagens.length} enviada{g.mensagens.length === 1 ? "" : "s"}
                            </span>
                          </span>
                        </button>
                        {expanded ?
                          <div className="pb-1 pl-6 pr-2">
                            {g.mensagens.map((m) =>
                              renderListRow(
                                "me-" + m.mensagemId,
                                m.corpoPreview,
                                fmtWhen(m.createdAt),
                                0,
                                0,
                                false,
                                () => jumpToMessage(m.assuntoId, m.mensagemId),
                              ),
                            )}
                          </div>
                        : null}
                      </div>
                    );
                  })}
                </ConversaInboxSection>
              : null}

              <ConversaInboxSection
                title="Clientes (Produção)"
                open={sectionsOpen.clientes}
                onToggle={() => toggleSection("clientes")}
                count={clientesFiltrados.length}
                headerClass="bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              >
                <input
                  type="search"
                  placeholder="Filtrar cliente…"
                  value={clienteFilter}
                  onChange={(e) => setClienteFilter(e.target.value)}
                  className="mx-3 mb-1 w-[calc(100%-1.5rem)] rounded border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                />
                {clientesFiltrados.map((c) => {
                  const expanded = expandedClienteKey === c.clienteKey;
                  const activeCanal = c.canais.some((ch) => ch.assuntoId === selectedId);
                  return (
                    <div key={c.clienteKey} className="border-b border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedClienteKey(expanded ? null : c.clienteKey)
                        }
                        className={
                          "flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-white dark:hover:bg-slate-900 " +
                          (activeCanal ? "bg-white dark:bg-slate-900" : "")
                        }
                      >
                        <span className="mt-0.5 text-[10px] text-slate-400">{expanded ? "▾" : "▸"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {c.nome}
                          </span>
                        </span>
                        <ConversaUnreadBadges general={c.unreadGeneral} mention={c.unreadMention} />
                      </button>
                      {expanded ?
                        <div className="pb-1 pl-6 pr-2">
                          {c.canais.map((ch) =>
                            renderListRow(
                              `${c.clienteKey}-${ch.papel}`,
                              ch.label,
                              ch.lastMessagePreview,
                              ch.unreadGeneral,
                              ch.unreadMention,
                              selectedId === ch.assuntoId,
                              () => {
                                if (ch.assuntoId && ch.assuntoSlug) {
                                  pickAssunto({
                                    id: ch.assuntoId,
                                    slug: ch.assuntoSlug,
                                    titulo: ch.label,
                                    display: ch.label,
                                    unreadCount: ch.unreadGeneral + ch.unreadMention,
                                    unreadGeneralCount: ch.unreadGeneral,
                                    unreadMentionCount: ch.unreadMention,
                                    mentionUnread: ch.unreadMention > 0,
                                    lastMessagePreview: ch.lastMessagePreview,
                                  });
                                  return;
                                }
                                void openClienteCanal(c.clienteKey, ch.papel);
                              },
                            ),
                          )}
                        </div>
                      : null}
                    </div>
                  );
                })}
              </ConversaInboxSection>
            </>
          }
        </div>
      </aside>
  );

  const chatPane = (
      <div
        className={
          "flex min-h-[280px] min-w-0 flex-1 basis-0 flex-col overflow-hidden bg-white dark:bg-slate-900 " +
          (chatOpen ? "flex" : "hidden lg:flex")
        }
      >
        {!chatOpen ?
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
            <p>Selecione um assunto à esquerda para abrir a conversa.</p>
            <p className="mt-1 text-xs">Ou volte ao quadro kanban.</p>
          </div>
        : <>
            <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-700 sm:px-4 sm:py-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={voltarParaListaConversas}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/50"
                >
                  ← Voltar
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {activeAssunto?.display ?? "Conversa"}
                  </h3>
                  <p className="text-[10px] text-slate-400">Digite @ para escolher quem mencionar na lista.</p>
                </div>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={() => void refreshConversas()}
                  className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Recarregar mensagens"
                >
                  {refreshing ? "…" : "↻"}
                </button>
              </div>
            </div>
            <ConversaGrupoMembros
              assuntoId={selectedId!}
              grupoEmails={grupoEmails}
              participants={participants}
              highlightEmpty={mensagens.length === 0}
              onSaved={(emails) => setGrupoEmails(emails)}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
              {mensagens.map((m) => (
                <ConversaChatMessage
                  key={m.id}
                  m={m}
                  participants={participants}
                  viewerEmail={viewerEmail}
                  fmtWhen={fmtWhen}
                  onReply={(x) => setReplyTo(x)}
                  onRefresh={() => {
                    void loadMensagens(selectedId!);
                    void loadInbox({ silent: true });
                  }}
                />
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              {replyTo ?
                <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] dark:border-violet-800 dark:bg-violet-950/40">
                  <span>
                    Respondendo <strong>{replyTo.autorNome}</strong>: {replyTo.corpo.slice(0, 80)}
                  </span>
                  <button type="button" className="shrink-0 font-bold text-slate-500" onClick={() => setReplyTo(null)}>
                    ×
                  </button>
                </div>
              : null}
              {pendingFiles.length > 0 ?
                <p className="mb-1 text-[10px] text-slate-500">
                  {pendingFiles.length} arquivo(s): {pendingFiles.map((f) => f.name).join(", ")}
                </p>
              : null}
              <ChamadoMentionTextarea
                value={draft}
                onChange={setDraft}
                participants={participants}
                placeholder="Mensagem… digite @ para mencionar"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                disabled={chatBusy}
                onEnterSubmit={() => void sendMessage()}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600">
                  Anexar
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,audio/*,video/*,application/pdf"
                    onChange={(e) => {
                      const list = e.target.files ? [...e.target.files] : [];
                      if (list.length) setPendingFiles((p) => [...p, ...list]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={chatBusy}
                  onClick={() => void sendMessage()}
                  className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
                >
                  {chatBusy ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </>
        }
      </div>
  );

  return (
    <div
      className={
        "flex h-full max-h-full min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden lg:flex-row lg:gap-0 " +
        (showChatMobile ? "min-h-[280px] flex-col" : "flex-col lg:flex-row")
      }
    >
      {sidebar}
      {hideChat ? null : chatPane}
    </div>
  );
}
