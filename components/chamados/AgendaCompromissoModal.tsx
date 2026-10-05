"use client";

import { useEffect, useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";
import { prazoLimiteInputFromIso } from "@/lib/chamados/chamadoUtils";

export type AgendaCompromissoEditInitial = {
  id: string;
  titulo: string;
  descricao: string;
  inicioEm: string;
  participantes: string[];
  alarmeAtivo?: boolean;
};

type Props = {
  open: boolean;
  busy: boolean;
  defaultDate: string;
  participants: ChamadoParticipant[];
  viewerEmail: string;
  edit?: AgendaCompromissoEditInitial | null;
  onClose: () => void;
  onSubmit: (payload: {
    titulo: string;
    descricao: string;
    inicioEm: string;
    participantes: string[];
    alarmeAtivo: boolean;
  }) => void;
  onUpdate?: (
    id: string,
    payload: {
      titulo: string;
      descricao: string;
      inicioEm: string;
      participantes: string[];
      alarmeAtivo: boolean;
    },
  ) => void;
};

function isoToLocalDateTime(iso: string): { date: string; hora: string } {
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return { date, hora: hora.replace(".", ":") };
  } catch {
    return { date: prazoLimiteInputFromIso(iso), hora: "09:00" };
  }
}

export function AgendaCompromissoModal({
  open,
  busy,
  defaultDate,
  participants,
  viewerEmail,
  edit,
  onClose,
  onSubmit,
  onUpdate,
}: Props) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(defaultDate);
  const [hora, setHora] = useState("09:00");
  const [sel, setSel] = useState<string[]>([]);
  const [alarmeAtivo, setAlarmeAtivo] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setTitulo(edit.titulo);
      setDescricao(edit.descricao || "");
      const { date, hora: h } = isoToLocalDateTime(edit.inicioEm);
      setData(date || defaultDate);
      setHora(h);
      setSel(edit.participantes.slice());
      setAlarmeAtivo(Boolean(edit.alarmeAtivo));
    } else {
      setData(defaultDate);
      setTitulo("");
      setDescricao("");
      setHora("09:00");
      setSel([]);
      setAlarmeAtivo(false);
    }
  }, [open, defaultDate, edit]);

  if (!open) return null;

  function toggle(email: string) {
    const e = email.toLowerCase();
    if (e === viewerEmail.toLowerCase()) return;
    setSel((prev) =>
      prev.some((x) => x.toLowerCase() === e) ? prev.filter((x) => x.toLowerCase() !== e) : [...prev, email],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const inicioEm = `${data}T${hora}:00-03:00`;
    const payload = { titulo, descricao, inicioEm, participantes: sel, alarmeAtivo };
    if (edit && onUpdate) onUpdate(edit.id, payload);
    else onSubmit(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {edit ? "Editar compromisso" : "Novo compromisso"}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Aparece na agenda em <strong className="text-sky-700 dark:text-sky-300">azul</strong> para você; convidados
          veem em <strong className="text-amber-700 dark:text-amber-300">âmbar</strong>.
        </p>

        <label className="mt-3 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          Título
          <input
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>

        <div className="mt-2 flex gap-2">
          <label className="flex-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Data
            <input
              type="date"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <label className="w-28 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Hora
            <input
              type="time"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
            />
          </label>
        </div>

        <label className="mt-2 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          Detalhes (opcional)
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>

        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] dark:border-slate-700 dark:bg-slate-800/50">
          <input
            type="checkbox"
            checked={alarmeAtivo}
            onChange={(e) => setAlarmeAtivo(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">Alarme sonoro</span>
            <span className="mt-0.5 block text-slate-500">
              Só toca se você marcar aqui. No celular, ative notificações do IbiZap (Tela de Início + permissão).
            </span>
          </span>
        </label>

        {participants.length > 0 ?
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Convidar pessoas</p>
            <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {participants
                .filter((p) => p.email.toLowerCase() !== viewerEmail.toLowerCase())
                .map((p) => (
                  <label key={p.email} className="flex items-center gap-2 py-0.5 text-xs">
                    <input
                      type="checkbox"
                      checked={sel.some((e) => e.toLowerCase() === p.email.toLowerCase())}
                      onChange={() => toggle(p.email)}
                    />
                    {p.displayName}
                  </label>
                ))}
            </div>
          </div>
        : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-600"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !titulo.trim()}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? "Salvando…" : edit ? "Salvar alterações" : "Salvar compromisso"}
          </button>
        </div>
      </form>
    </div>
  );
}
