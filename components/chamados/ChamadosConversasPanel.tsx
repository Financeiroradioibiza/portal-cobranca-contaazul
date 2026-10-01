"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { ChamadoMentionTextarea } from "@/components/chamados/ChamadoMentionTextarea";
import { ConversaChatMessage } from "@/components/chamados/ConversaChatMessage";
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

type Props = {
  selectedId: string | null;
  onSelect: (assunto: ConversaAssuntoListItem | null) => void;
  participants: ChamadoParticipant[];
  viewerEmail?: string;
  /** slug da URL ?conversa= */
  initialSlug?: string | null;
  /** Oculta o painel de chat (só coluna # visível). */
  hideChat?: boolean;
};

export function ChamadosConversasPanel({
  selectedId,
  onSelect,
  participants,
  viewerEmail = "",
  initialSlug,
  hideChat = false,
}: Props) {
  const [inbox, setInbox] = useState<InboxData | null>(null);
  const [assuntos, setAssuntos] = useState<ConversaAssuntoListItem[]>([]);
  const [clienteFilter, setClienteFilter] = useState("");
  const [expandedClienteKey, setExpandedClienteKey] = useState<string | null>(null);
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSlugHandled = useRef(false);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/chamados/conversas/inbox", { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      const box = (data as { inbox?: InboxData })?.inbox;
      if (box) {
        setInbox(box);
        setAssuntos(box.canais);
      } else {
        setInbox(null);
        setAssuntos([]);
      }
    } catch {
      setInbox(null);
      setAssuntos([]);
    } finally {
      setLoading(false);
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
    }
    return map;
  }, [assuntos, inbox]);

  const selected = useMemo(
    () => (selectedId ? (allAssuntos.get(selectedId) ?? null) : null),
    [allAssuntos, selectedId],
  );

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
      return;
    }
    void loadMensagens(selectedId);
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
      onSelect(hit);
    }
  }, [initialSlug, allAssuntos, onSelect]);

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
      await loadInbox();
      if (created) onSelect(created);
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
      await loadInbox();
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
      await loadInbox();
      if (created) onSelect(created);
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
      await loadInbox();
      const created = (data as { assunto?: ConversaAssuntoListItem })?.assunto;
      if (created) onSelect(created);
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
      await loadInbox();
    } catch {
      setMsg("Erro ao migrar prospect.");
    }
  }

  function toggleSection(key: keyof typeof sectionsOpen) {
    setSectionsOpen((s) => ({ ...s, [key]: !s[key] }));
  }

  function jumpToMessage(assuntoId: string, mensagemId: string) {
    const a = allAssuntos.get(assuntoId);
    if (a) onSelect(a);
    setTimeout(() => {
      document.getElementById("msg-" + mensagemId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
  }

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

  const sidebar = (
      <aside className="flex h-full max-h-[38vh] w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 sm:max-h-none lg:w-64 lg:max-w-[16rem] lg:border-b-0 lg:border-r xl:w-72">
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Conversas</p>
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
        <div className="min-h-0 flex-1 overflow-y-auto">
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
                      () => onSelect(a),
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
                        () => onSelect(p),
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

              {inbox && inbox.minhasEnviadas.length > 0 ?
                <ConversaInboxSection
                  title="Minhas enviadas"
                  open={sectionsOpen.minhas}
                  onToggle={() => toggleSection("minhas")}
                  count={inbox.minhasEnviadas.length}
                  headerClass="bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
                >
                  {inbox.minhasEnviadas.slice(0, 20).map((m) =>
                    renderListRow(
                      "me-" + m.mensagemId,
                      m.assuntoDisplay,
                      m.corpoPreview,
                      0,
                      0,
                      false,
                      () => jumpToMessage(m.assuntoId, m.mensagemId),
                    ),
                  )}
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
                              () => void openClienteCanal(c.clienteKey, ch.papel),
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
      <div className="flex min-h-[280px] min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-900">
        {!selected ?
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
            <p>Selecione um assunto à esquerda para abrir a conversa.</p>
            <p className="mt-1 text-xs">Ou volte ao quadro kanban.</p>
          </div>
        : <>
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selected.display}</h3>
              <p className="text-[10px] text-slate-400">Digite @ para escolher quem mencionar na lista.</p>
            </div>
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
                    void loadInbox();
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
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden lg:flex-row lg:gap-0">
      {sidebar}
      {hideChat ? null : chatPane}
    </div>
  );
}
