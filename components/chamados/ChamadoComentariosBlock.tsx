"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";
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
  /** E-mail da sessão — destaca mensagens próprias. */
  viewerEmail?: string;
  participants?: ChamadoParticipant[];
};

export function ChamadoComentariosBlock({ chamadoId, viewerEmail, participants = [] }: Props) {
  const [comentarios, setComentarios] = useState<ChamadoComentarioView[]>([]);
  const [loading, setLoading] = useState(true);
  const [corpo, setCorpo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chamados/${encodeURIComponent(chamadoId)}/comentarios`, {
        credentials: "same-origin",
      });
      const data = res.ok ? await res.json() : null;
      setComentarios(Array.isArray(data?.comentarios) ? data.comentarios : []);
    } catch {
      setComentarios([]);
    } finally {
      setLoading(false);
    }
  }, [chamadoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const text = corpo.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/chamados/${encodeURIComponent(chamadoId)}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ corpo: text }),
      });
      if (!res.ok) {
        setErr("Não foi possível enviar a resposta.");
        return;
      }
      const data = await res.json();
      if (data.comentario) {
        setComentarios((prev) => [...prev, data.comentario as ChamadoComentarioView]);
      } else {
        await load();
      }
      setCorpo("");
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
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Respostas e perguntas</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Todos os envolvidos recebem e-mail a cada nova mensagem.
      </p>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {loading ?
          <p className="text-xs text-slate-500">Carregando…</p>
        : comentarios.length === 0 ?
          <p className="text-xs text-slate-500">Nenhuma resposta ainda. Escreva abaixo.</p>
        : comentarios.map((c) => {
            const mine = me && c.autorEmail.toLowerCase() === me;
            const author = byEmail.get(c.autorEmail.toLowerCase());
            return (
              <div
                key={c.id}
                className={
                  "flex gap-2 rounded-lg px-2 py-2 text-sm " +
                  (mine ? "ml-4 flex-row-reverse" : "mr-4")
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
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.corpo}</p>
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
        {err ?
          <p className="text-xs text-rose-600">{err}</p>
        : null}
        <button
          type="submit"
          disabled={busy || !corpo.trim()}
          className="rounded-lg bg-[#c4146a] px-4 py-2 text-xs font-bold text-white hover:bg-[#a81058] disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar resposta"}
        </button>
      </form>
    </div>
  );
}
