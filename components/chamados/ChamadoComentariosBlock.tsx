"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";
import { ChamadoAnexoMedia } from "@/components/chamados/ChamadoAnexosBlock";
import { CONVERSA_REACOES } from "@/lib/chamados/conversaConstants";
import type { ChamadoComentarioView, ChamadoParticipant } from "@/lib/chamados/chamadoTypes";

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
  chamadoId: string;
  viewerEmail?: string;
  participants?: ChamadoParticipant[];
  /** Fecha o modal após enviar resposta (e-mail único). */
  onReplySent?: () => void;
};

export function ChamadoComentariosBlock({
  chamadoId,
  viewerEmail,
  participants = [],
  onReplySent,
}: Props) {
  const [comentarios, setComentarios] = useState<ChamadoComentarioView[]>([]);
  const [loading, setLoading] = useState(true);
  const [corpo, setCorpo] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reactionOpenId, setReactionOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chamados/${encodeURIComponent(chamadoId)}/comentarios`, {
        credentials: "same-origin",
      });
      const data = res.ok ? await res.json() : null;
      const rows = (data as { comentarios?: ChamadoComentarioView[] })?.comentarios;
      setComentarios(
        Array.isArray(rows) ?
          rows.map((c) => ({
            ...c,
            anexos: c.anexos ?? [],
            reacoes: c.reacoes ?? [],
          }))
        : [],
      );
    } catch {
      setComentarios([]);
    } finally {
      setLoading(false);
    }
  }, [chamadoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleReaction(comentarioId: string, tipo: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/chamados/comentarios/${encodeURIComponent(comentarioId)}/reacao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ tipo }),
        },
      );
      const data = res.ok ? await res.json() : null;
      const reacoes = (data as { reacoes?: ChamadoComentarioView["reacoes"] })?.reacoes;
      if (Array.isArray(reacoes)) {
        setComentarios((prev) =>
          prev.map((c) => (c.id === comentarioId ? { ...c, reacoes } : c)),
        );
      } else {
        await load();
      }
      setReactionOpenId(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const text = corpo.trim();
    if (!text && pendingFiles.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("corpo", text);
      for (const f of pendingFiles) fd.append("files", f);
      const res = await fetch(`/api/chamados/${encodeURIComponent(chamadoId)}/comentarios`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok) {
        setErr("Não foi possível enviar a resposta.");
        return;
      }
      setCorpo("");
      setPendingFiles([]);
      onReplySent?.();
    } catch {
      setErr("Erro de rede ao enviar.");
    } finally {
      setBusy(false);
    }
  }

  const me = viewerEmail?.trim().toLowerCase() ?? "";
  const byEmail = new Map(participants.map((p) => [p.email.toLowerCase(), p]));

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Respostas</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Cada nova resposta notifica o time por e-mail (uma vez). Use reações 👍 sem e-mail.
      </p>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {loading ?
          <p className="text-xs text-slate-500">Carregando…</p>
        : comentarios.length === 0 ?
          <p className="text-xs text-slate-500">Nenhuma resposta ainda.</p>
        : comentarios.map((c) => {
            const mine = me && c.autorEmail.toLowerCase() === me;
            const author = byEmail.get(c.autorEmail.toLowerCase());
            return (
              <div
                key={c.id}
                className={
                  "flex gap-2 rounded-lg px-2 py-2 text-sm " + (mine ? "ml-4 flex-row-reverse" : "mr-4")
                }
              >
                {!mine ?
                  <PortalUserAvatar
                    userId={author?.userId}
                    displayName={c.autorNome}
                    email={c.autorEmail}
                    hasAvatar={author?.hasAvatar}
                    avatarVersion={author?.avatarVersion}
                    size="xs"
                    className="mt-0.5"
                  />
                : null}
                <div
                  className={
                    "min-w-0 flex-1 rounded-lg px-3 py-2 " +
                    (mine ?
                      "bg-violet-600 text-white"
                    : "bg-white shadow-sm dark:bg-slate-900 dark:text-slate-100")
                  }
                >
                  <div className={"text-[10px] font-bold " + (mine ? "text-violet-100" : "text-slate-500")}>
                    {c.autorNome} · {fmtWhen(c.createdAt)}
                  </div>
                  {c.corpo && c.corpo !== "(anexo)" ?
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.corpo}</p>
                  : null}
                  {c.anexos.map((a) => (
                    <ChamadoAnexoMedia key={a.id} anexo={a} />
                  ))}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {c.reacoes.map((r) => (
                      <button
                        key={r.tipo}
                        type="button"
                        disabled={busy}
                        title={r.label}
                        onClick={() => void toggleReaction(c.id, r.tipo)}
                        className={
                          "rounded-full px-1.5 py-0.5 text-[11px] " +
                          (r.mine ?
                            "bg-violet-200 ring-1 ring-violet-400 dark:bg-violet-900"
                          : "bg-slate-100 dark:bg-slate-800")
                        }
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded px-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => setReactionOpenId(reactionOpenId === c.id ? null : c.id)}
                    >
                      Reagir
                    </button>
                  </div>
                  {reactionOpenId === c.id ?
                    <div className="mt-1 flex flex-wrap gap-1">
                      {CONVERSA_REACOES.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={busy}
                          title={r.label}
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-sm hover:bg-slate-50 dark:border-slate-600"
                          onClick={() => void toggleReaction(c.id, r.id)}
                        >
                          {r.emoji}
                        </button>
                      ))}
                    </div>
                  : null}
                </div>
              </div>
            );
          })
        }
      </div>

      <form onSubmit={(e) => void submitReply(e)} className="mt-3 space-y-2">
        <textarea
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          rows={3}
          placeholder="Responder, perguntar, atualizar o time…"
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          disabled={busy}
        />
        {pendingFiles.length > 0 ?
          <p className="text-[10px] text-slate-500">
            {pendingFiles.length} arquivo(s): {pendingFiles.map((f) => f.name).join(", ")}
          </p>
        : null}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600">
            Anexar
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/*,audio/*,.mp3,audio/mpeg"
              disabled={busy}
              onChange={(e) => {
                const list = e.target.files ? [...e.target.files] : [];
                if (list.length) setPendingFiles((p) => [...p, ...list]);
                e.target.value = "";
              }}
            />
          </label>
          {err ?
            <p className="text-xs text-rose-600">{err}</p>
          : null}
          <button
            type="submit"
            disabled={busy || (!corpo.trim() && pendingFiles.length === 0)}
            className="ml-auto rounded-lg bg-[#c4146a] px-4 py-2 text-xs font-bold text-white hover:bg-[#a81058] disabled:opacity-50"
          >
            {busy ? "Enviando…" : "Enviar resposta"}
          </button>
        </div>
      </form>
    </div>
  );
}
