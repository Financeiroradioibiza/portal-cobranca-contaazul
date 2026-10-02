"use client";

import { useEffect, useState } from "react";
import type { ChamadoParticipant } from "@/lib/chamados/chamadoTypes";

type Props = {
  open: boolean;
  busy: boolean;
  defaultDate: string;
  participants: ChamadoParticipant[];
  viewerEmail: string;
  onClose: () => void;
  onSubmit: (payload: {
    titulo: string;
    descricao: string;
    inicioEm: string;
    participantes: string[];
  }) => void;
};

export function AgendaCompromissoModal({
  open,
  busy,
  defaultDate,
  participants,
  viewerEmail,
  onClose,
  onSubmit,
}: Props) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(defaultDate);
  const [hora, setHora] = useState("09:00");
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setData(defaultDate);
      setTitulo("");
      setDescricao("");
      setHora("09:00");
      setSel([]);
    }
  }, [open, defaultDate]);

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
    onSubmit({ titulo, descricao, inicioEm, participantes: sel });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Novo compromisso</h3>
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
            {busy ? "Salvando…" : "Salvar compromisso"}
          </button>
        </div>
      </form>
    </div>
  );
}
