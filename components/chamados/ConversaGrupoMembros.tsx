"use client";

import { useMemo, useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { PortalUserAvatar } from "@/components/portal/PortalUserAvatar";

type Props = {
  assuntoId: string;
  grupoEmails: string[];
  participants: ChamadoParticipant[];
  compact?: boolean;
  /** Destaque quando ainda não há grupo (primeira conversa). */
  highlightEmpty?: boolean;
  onSaved: (emails: string[]) => void;
};

export function ConversaGrupoMembros({
  assuntoId,
  grupoEmails,
  participants,
  compact = false,
  highlightEmpty = false,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(highlightEmpty && grupoEmails.length === 0);
  const [draft, setDraft] = useState<string[]>(grupoEmails);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const byEmail = useMemo(() => {
    const m = new Map<string, ChamadoParticipant>();
    for (const p of participants) m.set(p.email.toLowerCase(), p);
    return m;
  }, [participants]);

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR")),
    [participants],
  );

  function syncDraftFromProps() {
    setDraft(grupoEmails);
  }

  function toggleEmail(email: string) {
    const key = email.toLowerCase();
    setDraft((prev) => {
      const has = prev.some((e) => e.toLowerCase() === key);
      if (has) return prev.filter((e) => e.toLowerCase() !== key);
      return [...prev, email];
    });
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/chamados/conversas/${encodeURIComponent(assuntoId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ grupoEmails: draft }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setErr("Não foi possível salvar o grupo.");
        return;
      }
      const saved = (data as { grupoEmails?: string[] })?.grupoEmails ?? draft;
      onSaved(saved);
      if (!highlightEmpty || saved.length > 0) setOpen(false);
    } catch {
      setErr("Erro de rede ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  const showBanner = highlightEmpty && grupoEmails.length === 0;

  return (
    <div
      className={
        "border-b border-slate-200 px-3 py-2 dark:border-slate-700 " +
        (showBanner ? "bg-amber-50 dark:bg-amber-950/30" : "bg-slate-50/80 dark:bg-slate-950/40")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Grupo</span>
        {grupoEmails.length === 0 ?
          <span className="text-[10px] text-amber-800 dark:text-amber-200">Defina quem recebe avisos neste assunto</span>
        : null}
        <button
          type="button"
          className="ml-auto text-[10px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
          onClick={() => {
            syncDraftFromProps();
            setOpen((v) => !v);
          }}
        >
          {open ? "Fechar" : grupoEmails.length === 0 ? "Escolher pessoas" : "Editar grupo"}
        </button>
      </div>

      {!open && grupoEmails.length > 0 ?
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {grupoEmails.map((email) => {
            const p = byEmail.get(email.toLowerCase());
            return (
              <span
                key={email}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-600"
                title={email}
              >
                {p ?
                  <PortalUserAvatar
                    userId={p.userId}
                    displayName={p.displayName}
                    email={p.email}
                    hasAvatar={p.hasAvatar}
                    avatarVersion={p.avatarVersion}
                    size="xs"
                  />
                : null}
                <span className="truncate">{p?.displayName ?? email}</span>
              </span>
            );
          })}
        </div>
      : null}

      {open ?
        <div className={"mt-2 space-y-2 " + (compact ? "" : "")}>
          <p className="text-[10px] leading-snug text-slate-500">
            Estas pessoas são avisadas em <strong>todas</strong> as mensagens aqui. Use @ no texto para incluir alguém
            extra naquela mensagem.
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-900">
            {sortedParticipants.map((p) => {
              const checked = draft.some((e) => e.toLowerCase() === p.email.toLowerCase());
              return (
                <label
                  key={p.email}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleEmail(p.email)}
                    className="rounded border-slate-300"
                  />
                  <PortalUserAvatar
                    userId={p.userId}
                    displayName={p.displayName}
                    email={p.email}
                    hasAvatar={p.hasAvatar}
                    avatarVersion={p.avatarVersion}
                    size="xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-800 dark:text-slate-100">
                    {p.displayName}
                  </span>
                </label>
              );
            })}
          </div>
          {err ?
            <p className="text-[10px] text-rose-600">{err}</p>
          : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || draft.length === 0}
              onClick={() => void save()}
              className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar grupo"}
            </button>
            {grupoEmails.length > 0 ?
              <button
                type="button"
                disabled={busy}
                className="rounded-lg px-2 py-1 text-xs text-slate-500"
                onClick={() => {
                  syncDraftFromProps();
                  setOpen(false);
                }}
              >
                Cancelar
              </button>
            : null}
          </div>
        </div>
      : null}
    </div>
  );
}
