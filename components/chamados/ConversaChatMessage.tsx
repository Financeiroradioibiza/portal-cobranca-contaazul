"use client";

import { useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { ConversaAnexoPreview } from "@/components/chamados/ChamadoAnexosBlock";
import { ChamadoMentionCorpo } from "@/components/chamados/ChamadoMentionCorpo";
import { ChamadoMentionTextarea } from "@/components/chamados/ChamadoMentionTextarea";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";
import { CONVERSA_REACOES } from "@/lib/chamados/conversaConstants";
import type { ConversaMensagemItem } from "@/components/chamados/ChamadosConversasPanel";

type Props = {
  m: ConversaMensagemItem;
  participants: ChamadoParticipant[];
  viewerEmail: string;
  fmtWhen: (iso: string) => string;
  onReply: (m: ConversaMensagemItem) => void;
  onRefresh: () => void;
};

export function ConversaChatMessage({ m, participants, viewerEmail, fmtWhen, onReply, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(m.corpo);
  const author = participants.find((p) => p.email.toLowerCase() === m.autorEmail.toLowerCase());
  const isAuthor =
    viewerEmail.length > 0 && m.autorEmail.toLowerCase() === viewerEmail.toLowerCase();

  async function patch(body: Record<string, boolean | string>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/chamados/conversas/mensagens/${encodeURIComponent(m.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    const text = editDraft.trim();
    if (!text && m.anexos.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chamados/conversas/mensagens/${encodeURIComponent(m.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ corpo: text || m.corpo }),
      });
      if (!res.ok) return;
      setEditing(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeMessage() {
    if (!window.confirm("Apagar esta mensagem? Não dá para desfazer.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chamados/conversas/mensagens/${encodeURIComponent(m.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) return;
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleReaction(tipo: string) {
    setBusy(true);
    try {
      await fetch(`/api/chamados/conversas/mensagens/${encodeURIComponent(m.id)}/reacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ tipo }),
      });
      onRefresh();
      setShowReactions(false);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setEditDraft(m.corpo);
    setEditing(true);
  }

  function cancelEdit() {
    setEditDraft(m.corpo);
    setEditing(false);
  }

  return (
    <div
      id={"msg-" + m.id}
      className={
        "mb-4 flex max-w-full gap-2 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-800 " +
        (m.naoLida ? "bg-violet-50/60 -mx-2 px-2 rounded-lg dark:bg-violet-950/20" : "")
      }
    >
      <PortalUserAvatar
        userId={author?.userId}
        displayName={m.autorNome}
        email={m.autorEmail}
        hasAvatar={author?.hasAvatar}
        avatarVersion={author?.avatarVersion}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{m.autorNome}</span>
          <span className="text-[10px] text-slate-400">{fmtWhen(m.createdAt)}</span>
          {m.favorito ?
            <span className="text-[10px] font-bold text-rose-600" title="Favorito / urgente">
              URGENTE
            </span>
          : null}
        </div>
        {m.replyTo ?
          <div className="mt-1 rounded-lg border-l-2 border-violet-400 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-400">
            <span className="font-semibold">{m.replyTo.autorNome}: </span>
            {m.replyTo.corpo.slice(0, 160)}
          </div>
        : null}
        {editing ?
          <div className="mt-2 space-y-2">
            <ChamadoMentionTextarea
              value={editDraft}
              onChange={setEditDraft}
              participants={participants}
              rows={3}
              disabled={busy}
              placeholder="Edite o texto… @ para mencionar"
              className="w-full rounded-lg border border-violet-300 px-2 py-1.5 text-sm dark:border-violet-700 dark:bg-slate-900"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
                onClick={() => void saveEdit()}
              >
                Salvar
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={cancelEdit}
              >
                Cancelar
              </button>
            </div>
          </div>
        : <>
            <p className="mt-1 break-words whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
              <ChamadoMentionCorpo corpo={m.corpo} participants={participants} />
            </p>
            {m.anexos.map((an) => (
              <ConversaAnexoPreview key={an.id} anexo={an} />
            ))}
          </>
        }
        {!editing && m.reacoes.length > 0 ?
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reacoes.map((r) => {
              const meta = CONVERSA_REACOES.find((x) => x.id === r.tipo);
              return (
                <button
                  key={r.tipo}
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleReaction(r.tipo)}
                  className={
                    "rounded-full px-2 py-0.5 text-xs " +
                    (r.mine ?
                      "bg-violet-200 font-semibold dark:bg-violet-900"
                    : "bg-slate-100 dark:bg-slate-800")
                  }
                  title={meta?.label}
                >
                  {meta?.emoji ?? r.tipo} {r.count}
                </button>
              );
            })}
          </div>
        : null}
        {!editing ?
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => onReply(m)}
            >
              Responder
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setShowReactions((v) => !v)}
            >
              Reagir
            </button>
            {isAuthor ?
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={startEdit}
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  onClick={() => void removeMessage()}
                >
                  Apagar
                </button>
              </>
            : null}
            <button
              type="button"
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => void patch({ favorito: !m.favorito })}
            >
              {m.favorito ? "Desfavoritar" : "Urgente ★"}
            </button>
            {m.naoLida ?
              <button
                type="button"
                disabled={busy}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-50"
                onClick={() => void patch({ marcarLida: true })}
              >
                Marcar lida
              </button>
            : <button
                type="button"
                disabled={busy}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                onClick={() => void patch({ forcarNaoLida: true })}
              >
                Marcar não lida
              </button>
            }
          </div>
        : null}
        {showReactions && !editing ?
          <div className="mt-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {CONVERSA_REACOES.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                title={r.label}
                className="rounded px-2 py-1 text-sm hover:bg-violet-50 dark:hover:bg-violet-950"
                onClick={() => void toggleReaction(r.id)}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        : null}
      </div>
    </div>
  );
}
