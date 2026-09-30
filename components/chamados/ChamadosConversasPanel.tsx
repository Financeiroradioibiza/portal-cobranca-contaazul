"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { ConversaAnexoPreview } from "@/components/chamados/ChamadoAnexosBlock";

export type ConversaAssuntoListItem = {
  id: string;
  slug: string;
  titulo: string;
  display: string;
  unreadCount: number;
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
};

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

function renderCorpoWithMentions(corpo: string): ReactNode {
  const parts = corpo.split(/(@[a-zA-Z0-9._\-]+(?:@[a-zA-Z0-9.\-]+)?)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ?
      <span key={i} className="font-semibold text-violet-700 dark:text-violet-300">
        {p}
      </span>
    : p,
  );
}

type Props = {
  selectedId: string | null;
  onSelect: (assunto: ConversaAssuntoListItem | null) => void;
  participants: ChamadoParticipant[];
  /** slug da URL ?conversa= */
  initialSlug?: string | null;
  /** Oculta o painel de chat (só coluna # visível). */
  hideChat?: boolean;
};

export function ChamadosConversasPanel({
  selectedId,
  onSelect,
  participants,
  initialSlug,
  hideChat = false,
}: Props) {
  const [assuntos, setAssuntos] = useState<ConversaAssuntoListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<ConversaMensagemItem[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialSlugHandled = useRef(false);

  const loadAssuntos = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q?.trim() ? `/api/chamados/conversas?q=${encodeURIComponent(q.trim())}` : "/api/chamados/conversas";
      const res = await fetch(url, { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      const rows = (data as { assuntos?: ConversaAssuntoListItem[] })?.assuntos;
      setAssuntos(Array.isArray(rows) ? rows : []);
    } catch {
      setAssuntos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssuntos();
  }, [loadAssuntos]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim()) void loadAssuntos(search);
      else void loadAssuntos();
    }, 300);
    return () => clearTimeout(t);
  }, [search, loadAssuntos]);

  const selected = useMemo(
    () => assuntos.find((a) => a.id === selectedId) ?? null,
    [assuntos, selectedId],
  );

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

  const markRead = useCallback(async (assuntoId: string) => {
    await fetch(`/api/chamados/conversas/${assuntoId}/read`, {
      method: "POST",
      credentials: "same-origin",
    });
    setAssuntos((prev) =>
      prev.map((a) => (a.id === assuntoId ? { ...a, unreadCount: 0, mentionUnread: false } : a)),
    );
  }, []);

  useEffect(() => {
    if (hideChat || !selectedId) {
      if (hideChat) setMensagens([]);
      return;
    }
    void loadMensagens(selectedId);
    void markRead(selectedId);
    const iv = setInterval(() => void loadMensagens(selectedId), 15000);
    return () => clearInterval(iv);
  }, [selectedId, loadMensagens, markRead, hideChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    if (initialSlugHandled.current || !initialSlug || assuntos.length === 0) return;
    const slug = initialSlug.toLowerCase();
    const hit = assuntos.find((a) => a.slug === slug);
    if (hit) {
      initialSlugHandled.current = true;
      onSelect(hit);
    }
  }, [initialSlug, assuntos, onSelect]);

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
      await loadAssuntos();
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
      setPendingFiles([]);
      await loadMensagens(selectedId);
      await loadAssuntos();
    } catch {
      setMsg("Erro de rede ao enviar.");
    } finally {
      setChatBusy(false);
    }
  }

  const mentionHint =
    participants.length > 0 ?
      `Use @ para mencionar (ex.: @${participants[0]!.email.split("@")[0]})`
    : "Use @nome ou @email para mencionar alguém";

  const sidebar = (
      <aside className="flex h-full w-full shrink-0 flex-col border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Assuntos</p>
          <input
            type="search"
            placeholder="Buscar # ou texto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
          />
          <div className="mt-2 flex gap-1">
            <input
              type="text"
              placeholder="Novo # assunto"
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
              title="Criar assunto"
            >
              +
            </button>
          </div>
          {msg ?
            <p className="mt-1 text-[10px] text-rose-600">{msg}</p>
          : null}
        </div>
        <div className="max-h-48 overflow-y-auto lg:max-h-none lg:flex-1">
          {loading ?
            <p className="p-3 text-xs text-slate-400">Carregando…</p>
          : assuntos.length === 0 ?
            <p className="p-3 text-xs text-slate-400">Nenhum assunto. Crie um acima.</p>
          : assuntos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onSelect(a);
                }}
                className={
                  "flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left transition hover:bg-white dark:border-slate-800 dark:hover:bg-slate-900 " +
                  (selectedId === a.id ? "bg-white ring-1 ring-inset ring-violet-300 dark:bg-slate-900 dark:ring-violet-700" : "")
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {a.display}
                  </span>
                  {a.lastMessagePreview ?
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">{a.lastMessagePreview}</span>
                  : null}
                </span>
                {a.unreadCount > 0 ?
                  <span
                    className={
                      "portal-sidebar-item-badge shrink-0 " +
                      (a.mentionUnread ? "bg-violet-600 text-white" : "")
                    }
                    title={a.mentionUnread ? "Menção não lida" : "Mensagens não lidas"}
                  >
                    {a.unreadCount > 99 ? "99+" : a.unreadCount}
                  </span>
                : null}
              </button>
            ))
          }
        </div>
      </aside>
  );

  const chatPane = (
      <div className="flex min-h-[320px] min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
        {!selected ?
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
            <p>Selecione um assunto à esquerda para abrir a conversa.</p>
            <p className="mt-1 text-xs">Ou volte ao quadro kanban.</p>
          </div>
        : <>
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selected.display}</h3>
              <p className="text-[10px] text-slate-400">{mentionHint}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {mensagens.map((m) => (
                <div key={m.id} className="mb-4 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{m.autorNome}</span>
                    <span className="text-[10px] text-slate-400">{fmtWhen(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {renderCorpoWithMentions(m.corpo)}
                  </p>
                  {m.anexos.map((an) => (
                    <ConversaAnexoPreview key={an.id} anexo={an} />
                  ))}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              {pendingFiles.length > 0 ?
                <p className="mb-1 text-[10px] text-slate-500">
                  {pendingFiles.length} arquivo(s): {pendingFiles.map((f) => f.name).join(", ")}
                </p>
              : null}
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mensagem… @rodolfo para notificar"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
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
    <div className="flex h-full min-h-0 flex-1 flex-col lg:flex-row lg:gap-0">
      {sidebar}
      {hideChat ? null : chatPane}
    </div>
  );
}
