"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnvioManualAgendamentoDto, EnvioManualGrupoCliente } from "@/lib/enviosManuais/types";
import { ENVIO_MANUAL_MSG_DEFAULT } from "@/lib/enviosManuais/defaults";

type CaPessoa = { id: string; nome: string; documento?: string | null };

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950";

type Props = {
  open: boolean;
  initial: EnvioManualAgendamentoDto | null;
  nextColorIdx: number;
  onClose: () => void;
  onSave: (row: EnvioManualAgendamentoDto) => void;
};

export function EnviosManuaisEditorModal({ open, initial, nextColorIdx, onClose, onSave }: Props) {
  const [tipo, setTipo] = useState<"individual" | "grupo">("individual");
  const [clientLabel, setClientLabel] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [grupoClientes, setGrupoClientes] = useState<EnvioManualGrupoCliente[]>([]);
  const [day, setDay] = useState(5);
  const [rec, setRec] = useState(true);
  const [emails, setEmails] = useState("");
  const [msg, setMsg] = useState(ENVIO_MANUAL_MSG_DEFAULT);
  const [busca, setBusca] = useState("");
  const [pessoas, setPessoas] = useState<CaPessoa[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTipo(initial.tipo);
      setClientLabel(initial.client);
      setClienteId(initial.clienteId);
      setGrupoClientes(initial.grupoClientes ?? []);
      setDay(initial.day);
      setRec(initial.rec);
      setEmails(initial.emails.join(", "));
      setMsg(initial.msg || ENVIO_MANUAL_MSG_DEFAULT);
    } else {
      setTipo("individual");
      setClientLabel("");
      setClienteId(null);
      setGrupoClientes([]);
      setDay(5);
      setRec(true);
      setEmails("");
      setMsg(ENVIO_MANUAL_MSG_DEFAULT);
    }
    setBusca("");
    setPessoas([]);
  }, [open, initial]);

  const buscarPessoas = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setPessoas([]);
      return;
    }
    setBuscando(true);
    try {
      const res = await fetch(`/api/manual-envios/contaazul/pessoas?q=${encodeURIComponent(q.trim())}`, {
        credentials: "same-origin",
      });
      const json = await res.json();
      const list = Array.isArray(json.pessoas) ? json.pessoas : [];
      setPessoas(
        list.filter((p: unknown): p is CaPessoa => {
          return !!p && typeof p === "object" && typeof (p as CaPessoa).id === "string";
        }),
      );
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void buscarPessoas(busca), 280);
    return () => clearTimeout(t);
  }, [busca, open, buscarPessoas]);

  async function pickPessoa(p: CaPessoa) {
    if (tipo === "individual") {
      setClienteId(p.id);
      setClientLabel(p.nome);
      setBusca("");
      setPessoas([]);
      try {
        const res = await fetch(
          `/api/financeiro/envios-manuais/ca-emails?clienteId=${encodeURIComponent(p.id)}`,
          { credentials: "same-origin" },
        );
        const json = await res.json();
        if (json.ok && Array.isArray(json.emails) && json.emails.length) {
          setEmails(json.emails.join(", "));
        }
      } catch {
        /* mantém e-mails manuais */
      }
    } else {
      if (!grupoClientes.some((c) => c.id === p.id)) {
        setGrupoClientes((prev) => [...prev, { id: p.id, nome: p.nome }]);
      }
      setBusca("");
      setPessoas([]);
    }
  }

  function removeGrupo(id: string) {
    setGrupoClientes((prev) => prev.filter((c) => c.id !== id));
  }

  function submit() {
    const emailList = emails
      .split(/[,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!clientLabel.trim()) return;
    if (tipo === "individual" && !clienteId) return;
    if (tipo === "grupo" && !grupoClientes.length) return;

    const row: EnvioManualAgendamentoDto = {
      id: initial?.id ?? `em-${Date.now().toString(36)}`,
      tipo,
      client: clientLabel.trim(),
      clienteId: tipo === "individual" ? clienteId : null,
      day: Math.min(28, Math.max(1, day)),
      rec,
      emails: emailList,
      msg,
      colorIdx: initial?.colorIdx ?? nextColorIdx,
      sent: initial?.sent ?? false,
      grupoClientes: tipo === "grupo" ? grupoClientes : null,
    };
    onSave(row);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {initial ? "Editar agendamento" : "Novo agendamento"}
        </h2>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tipo === "individual" ? "bg-sky-600 text-white" : "border border-slate-300"}`}
            onClick={() => setTipo("individual")}
          >
            Individual
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tipo === "grupo" ? "bg-sky-600 text-white" : "border border-slate-300"}`}
            onClick={() => setTipo("grupo")}
          >
            Grupo
          </button>
        </div>

        {tipo === "grupo" ?
          <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Nome do grupo
            <input className={inputClass} value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} />
          </label>
        : null}

        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Buscar cliente Conta Azul
          <input
            className={inputClass}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome ou CNPJ…"
          />
        </label>
        {buscando ?
          <p className="text-xs text-slate-500">Buscando…</p>
        : null}
        {pessoas.length > 0 ?
          <ul className="mt-1 max-h-32 overflow-y-auto rounded border border-slate-200 text-sm dark:border-slate-700">
            {pessoas.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="block w-full px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => void pickPessoa(p)}
                >
                  {p.nome}
                  {p.documento ?
                    <span className="ml-1 text-xs text-slate-500">{p.documento}</span>
                  : null}
                </button>
              </li>
            ))}
          </ul>
        : null}

        {tipo === "individual" && clientLabel ?
          <p className="mt-2 text-xs text-slate-600">
            Cliente: <strong>{clientLabel}</strong>
          </p>
        : null}

        {tipo === "grupo" && grupoClientes.length ?
          <ul className="mt-2 space-y-1 text-xs">
            {grupoClientes.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                {c.nome}
                <button type="button" className="text-rose-600" onClick={() => removeGrupo(c.id)}>
                  remover
                </button>
              </li>
            ))}
          </ul>
        : null}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Dia do mês
            <input
              type="number"
              min={1}
              max={28}
              className={inputClass}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Repetir
            <select className={inputClass} value={rec ? "1" : "0"} onChange={(e) => setRec(e.target.value === "1")}>
              <option value="1">Todo mês</option>
              <option value="0">Envio único</option>
            </select>
          </label>
        </div>

        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
          E-mails (vírgula)
          <input className={inputClass} value={emails} onChange={(e) => setEmails(e.target.value)} />
        </label>

        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-400">
          Mensagem (<code>{`{mes}`}</code>)
          <textarea className={`${inputClass} min-h-[88px]`} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white"
            onClick={submit}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
