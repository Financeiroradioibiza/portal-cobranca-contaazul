"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  centavosToReaisInput,
  formatProspectValor,
  parseValorReaisInput,
  PROSPECT_COLUNAS,
  prospectLocalLabel,
} from "@/lib/cadastros/prospectConstants";
import type { ProspectView } from "@/lib/cadastros/prospectTypes";

function parseProspects(data: unknown): ProspectView[] {
  if (!data || typeof data !== "object" || !("prospects" in data)) return [];
  const rows = (data as { prospects?: unknown }).prospects;
  return Array.isArray(rows) ? (rows as ProspectView[]) : [];
}

export function ProspectsBoard() {
  const [prospects, setProspects] = useState<ProspectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ProspectView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cadastros/prospects", { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      setProspects(parseProspects(data));
    } catch {
      setMsg("Não foi possível carregar prospects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byColumn = useMemo(() => {
    const map: Record<string, ProspectView[]> = {};
    for (const col of PROSPECT_COLUNAS) map[col.id] = [];
    for (const p of prospects) {
      if (map[p.estagio]) map[p.estagio]!.push(p);
    }
    return map;
  }, [prospects]);

  async function patchProspect(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cadastros/prospects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível atualizar.");
        return;
      }
      const updated = (data as { prospect?: ProspectView }).prospect;
      if (updated) {
        setProspects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      }
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function createProspect(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cadastros/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível criar.");
        return;
      }
      const created = (data as { prospect?: ProspectView }).prospect;
      if (created) setProspects((prev) => [created, ...prev]);
      setCreating(false);
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Funil comercial — lead, contato, demo musical e fechamento.
        </p>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setSelected(null);
          }}
          className="rounded-full bg-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-fuchsia-500"
        >
          + Novo Prospect
        </button>
      </div>

      {msg ?
        <p className="text-sm text-rose-600">{msg}</p>
      : null}
      {loading ?
        <p className="text-sm text-slate-500">Carregando…</p>
      : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {PROSPECT_COLUNAS.map((col) => (
          <div key={col.id} className="flex min-h-[360px] flex-col">
            <div className={"mb-2 flex items-center gap-2 border-b-2 pb-2 " + col.header}>
              <span aria-hidden>{col.icon}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                {col.label}
              </span>
              <span className={"ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold " + col.badge}>
                {byColumn[col.id]?.length ?? 0}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {(byColumn[col.id] ?? []).map((p) => (
                <ProspectCard key={p.id} prospect={p} onOpen={() => setSelected(p)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        <span className="mr-1" aria-hidden>
          💡
        </span>
        <strong>Dica:</strong> ao fechar um prospect, use{" "}
        <Link href="/cadastros/solicitar-pdv" className="font-semibold text-fuchsia-700 underline dark:text-fuchsia-300">
          Solicitar PDV
        </Link>{" "}
        para enviar os dados ao financeiro. O pedido gera um chamado e o financeiro importa o PDV na Planilha Rio (cliente já cadastrado).
      </div>

      {creating ?
        <ProspectFormModal
          title="Novo prospect"
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={createProspect}
        />
      : null}

      {selected ?
        <ProspectDetailModal
          prospect={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onPatch={patchProspect}
        />
      : null}
    </div>
  );
}

function ProspectCard({ prospect, onOpen }: { prospect: ProspectView; onOpen: () => void }) {
  const subtitle = prospect.statusNota || prospect.origem;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-fuchsia-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-sm font-bold text-slate-900 dark:text-white">{prospect.nome}</p>
      <p className="mt-1 text-xs text-slate-500">
        {prospectLocalLabel(prospect.cidade, prospect.estado, prospect.unidades)}
      </p>
      {subtitle ?
        <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
      : null}
      <p className="mt-2 text-right text-sm font-bold text-fuchsia-600 dark:text-fuchsia-400">
        {formatProspectValor(prospect.valorCentavos)}
      </p>
    </button>
  );
}

function ProspectFormModal({
  title,
  busy,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  busy: boolean;
  initial?: Partial<ProspectView>;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [cidade, setCidade] = useState(initial?.cidade ?? "");
  const [estado, setEstado] = useState(initial?.estado ?? "");
  const [unidades, setUnidades] = useState(initial?.unidades ?? 1);
  const [origem, setOrigem] = useState(initial?.origem ?? "");
  const [statusNota, setStatusNota] = useState(initial?.statusNota ?? "");
  const [valor, setValor] = useState(centavosToReaisInput(initial?.valorCentavos ?? 0));
  const [contatoNome, setContatoNome] = useState(initial?.contatoNome ?? "");
  const [contatoEmail, setContatoEmail] = useState(initial?.contatoEmail ?? "");
  const [contatoTelefone, setContatoTelefone] = useState(initial?.contatoTelefone ?? "");
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? "");

  return (
    <ModalShell title={title} onClose={onClose}>
      <FormGrid>
        <Field label="Nome / marca" value={nome} onChange={setNome} />
        <Field label="Cidade" value={cidade} onChange={setCidade} />
        <Field label="UF" value={estado} onChange={setEstado} maxLength={2} />
        <Field label="Unidades" value={String(unidades)} onChange={(v) => setUnidades(Number(v) || 1)} type="number" />
        <Field label="Origem (ex.: indicação · Brewteco)" value={origem} onChange={setOrigem} className="sm:col-span-2" />
        <Field label="Status / nota no card" value={statusNota} onChange={setStatusNota} className="sm:col-span-2" />
        <Field label="Valor estimado (R$)" value={valor} onChange={setValor} placeholder="2.400,00" />
        <Field label="Contato" value={contatoNome} onChange={setContatoNome} />
        <Field label="E-mail contato" value={contatoEmail} onChange={setContatoEmail} />
        <Field label="Telefone" value={contatoTelefone} onChange={setContatoTelefone} />
      </FormGrid>
      <label className="mt-3 block text-xs font-semibold text-slate-600">
        Observações
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          rows={3}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600">
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy || !nome.trim()}
          onClick={() =>
            onSubmit({
              nome,
              cidade,
              estado,
              unidades,
              origem,
              statusNota,
              valorCentavos: parseValorReaisInput(valor),
              contatoNome,
              contatoEmail,
              contatoTelefone,
              observacoes,
            })
          }
          className="rounded-full bg-fuchsia-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </ModalShell>
  );
}

function ProspectDetailModal({
  prospect,
  busy,
  onClose,
  onPatch,
}: {
  prospect: ProspectView;
  busy: boolean;
  onClose: () => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const pedidoHref = `/cadastros/solicitar-pdv?prospectId=${encodeURIComponent(prospect.id)}`;

  return (
    <ModalShell title={prospect.nome} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        {prospectLocalLabel(prospect.cidade, prospect.estado, prospect.unidades)} ·{" "}
        <span className="font-bold text-fuchsia-600">{formatProspectValor(prospect.valorCentavos)}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        <ActionBtn
          disabled={busy}
          onClick={() => onPatch(prospect.id, { registrarContato: true })}
          tone="amber"
        >
          📞 Registrar contato
        </ActionBtn>
        <ActionBtn disabled={busy} onClick={() => onPatch(prospect.id, { enviarProposta: true })} tone="sky">
          📄 Enviar proposta
        </ActionBtn>
        <ActionBtn
          disabled={busy}
          onClick={() =>
            onPatch(prospect.id, {
              enviarDemo: true,
              previewMusicalNota: prospect.previewMusicalNota || "preview musical enviado",
            })
          }
          tone="violet"
        >
          🎵 Demo musical
        </ActionBtn>
        <ActionBtn disabled={busy} onClick={() => onPatch(prospect.id, { fechar: true })} tone="emerald">
          ✅ Fechar cliente
        </ActionBtn>
      </div>

      <label className="mt-4 block text-xs font-semibold text-slate-600">
        Link preview musical
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          defaultValue={prospect.previewMusicalUrl}
          onBlur={(e) => {
            if (e.target.value !== prospect.previewMusicalUrl) {
              void onPatch(prospect.id, { previewMusicalUrl: e.target.value });
            }
          }}
          placeholder="https://…"
        />
      </label>

      <label className="mt-3 block text-xs font-semibold text-slate-600">
        Grupo / MARCA (ao fechar)
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          defaultValue={prospect.rioGrupoNome}
          onBlur={(e) => {
            if (e.target.value !== prospect.rioGrupoNome) {
              void onPatch(prospect.id, { rioGrupoNome: e.target.value });
            }
          }}
        />
      </label>

      {prospect.pedidoClienteId ?
        <p className="mt-4 text-sm text-emerald-700">
          Pedido vinculado:{" "}
          <Link href={`/cadastros/solicitar-pdv?id=${prospect.pedidoClienteId}`} className="underline">
            abrir solicitação
          </Link>
        </p>
      : <Link
          href={pedidoHref}
          className="mt-4 inline-flex rounded-full bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white"
        >
          Criar solicitação PDV →
        </Link>
      }

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        {PROSPECT_COLUNAS.map((col) => (
          <button
            key={col.id}
            type="button"
            disabled={busy || prospect.estagio === col.id}
            onClick={() => onPatch(prospect.id, { estagio: col.id })}
            className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase disabled:opacity-40 dark:border-slate-600"
          >
            {col.icon} {col.label}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "amber" | "sky" | "violet" | "emerald";
}) {
  const tones = {
    amber: "bg-amber-100 text-amber-900 hover:bg-amber-200",
    sky: "bg-sky-100 text-sky-900 hover:bg-sky-200",
    violet: "bg-violet-100 text-violet-900 hover:bg-violet-200",
    emerald: "bg-emerald-600 text-white hover:bg-emerald-500",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={"rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 " + tones[tone]}
    >
      {children}
    </button>
  );
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  className,
  type = "text",
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className={"block text-xs font-semibold text-slate-600 " + (className ?? "")}>
      {label}
      <input
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-500">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
