"use client";

import { useCallback, useEffect, useState } from "react";
import { VinhetaAudioControls } from "@/components/criacao/VinhetaAudioControls";
import type { VinhetaHorarioFixoView } from "@/lib/criacao/programacaoVinhetaHorarioFixoService";
import type { VinhetaPastaView } from "@/lib/criacao/vinhetaPastaService";
import { vinhetaClienteImportErrorMessage } from "@/lib/criacao/vinhetaFromMusicaClienteService";

type VinhetaOpt = { id: string; nome: string };
type VinhetaDetalhe = VinhetaOpt & {
  tipo: string;
  temAudio: boolean;
  previewUrl: string | null;
};

export function VinhetasProgramacaoExtras({
  programacaoId,
  onEdit,
  onHorarioFixoSaved,
}: {
  programacaoId: string;
  onEdit?: () => void | Promise<void>;
  /** Depois do PUT — atualiza lista «Vinhetas únicas» no editor (evita race com onEdit no início do save). */
  onHorarioFixoSaved?: () => void | Promise<void>;
}) {
  return (
    <div className="mt-8 space-y-8">
      <VinhetaHorarioFixoBlock
        programacaoId={programacaoId}
        tipo="abertura"
        titulo="Vinheta de abertura"
        onEdit={onEdit}
        onSaved={onHorarioFixoSaved}
      />
      <VinhetaHorarioFixoBlock
        programacaoId={programacaoId}
        tipo="encerramento"
        titulo="Vinheta de encerramento"
        onEdit={onEdit}
        onSaved={onHorarioFixoSaved}
      />
      <VinhetaPastasBlock programacaoId={programacaoId} onEdit={onEdit} />
    </div>
  );
}

function VinhetaHorarioFixoBlock({
  programacaoId,
  tipo,
  titulo,
  onEdit,
  onSaved,
}: {
  programacaoId: string;
  tipo: "abertura" | "encerramento";
  titulo: string;
  onEdit?: () => void | Promise<void>;
  onSaved?: () => void | Promise<void>;
}) {
  const [vinhetas, setVinhetas] = useState<VinhetaDetalhe[]>([]);
  const [row, setRow] = useState<VinhetaHorarioFixoView | null>(null);
  const [hora, setHora] = useState("09:00");
  const [vinhetaId, setVinhetaId] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bibOpen, setBibOpen] = useState(false);

  const load = useCallback(async () => {
    const [rv, rh] = await Promise.all([
      fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`),
      fetch(`/api/criacao/programacoes/${programacaoId}/vinheta-horario-fixo`),
    ]);
    if (rv.ok) {
      const d = (await rv.json()) as { vinhetas: VinhetaDetalhe[] };
      setVinhetas(d.vinhetas ?? []);
    }
    if (rh.ok) {
      const d = (await rh.json()) as { items: VinhetaHorarioFixoView[] };
      const found = d.items.find((i) => i.tipo === tipo) ?? null;
      setRow(found);
      if (found) {
        setHora(found.hora);
        setVinhetaId(found.vinhetaId ?? "");
        setAtivo(found.ativo);
      }
    }
  }, [programacaoId, tipo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function salvar(nextAtivo = ativo) {
    setBusy(true);
    try {
      await onEdit?.();
      await fetch(`/api/criacao/programacoes/${programacaoId}/vinheta-horario-fixo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          hora,
          vinhetaId: vinhetaId || null,
          ativo: nextAtivo,
        }),
      });
      await load();
      await onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  async function desativar() {
    if (!confirm(`Desativar ${titulo.toLowerCase()}?`)) return;
    setAtivo(false);
    await salvar(false);
  }

  const vinhetaSel = vinhetaId ? vinhetas.find((v) => v.id === vinhetaId) : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <p className="mt-1 text-xs text-slate-500">
        Horário fixo todos os dias (Brasil). Gravado no portal; o player passa a usar após homologação/publicação.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Horário
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </label>
        <label className="min-w-[200px] flex-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
          Vinheta
          <select
            value={vinhetaId}
            onChange={(e) => setVinhetaId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">Selecione…</option>
            {vinhetas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => setBibOpen(true)}
          className="rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-900 dark:border-violet-800 dark:text-violet-200"
        >
          Importar Vinhetas clientes
        </button>
        <button
          type="button"
          disabled={busy || !vinhetaId}
          onClick={() => {
            setAtivo(true);
            void salvar(true);
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? "Salvando…" : row?.ativo ? "Atualizar" : "Ativar"}
        </button>
        {row?.ativo ?
          <button type="button" disabled={busy} onClick={() => void desativar()} className="text-xs text-rose-600 underline">
            Desativar
          </button>
        : null}
      </div>
      {row?.ativo ?
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
          Ativo · {row.hora} · {row.vinhetaNome ?? "—"}
        </p>
      : null}
      {vinhetaSel ?
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                {vinhetaSel.tipo === "ia" ? "IA" : vinhetaSel.tipo === "audio" ? "Áudio" : "TTS"}
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{vinhetaSel.nome}</span>
            </div>
            <VinhetaAudioControls
              vinhetaId={vinhetaSel.id}
              tipo={vinhetaSel.tipo}
              temAudio={vinhetaSel.temAudio}
              previewUrl={vinhetaSel.previewUrl}
              onUploaded={async () => {
                await onEdit?.();
                await load();
              }}
            />
          </div>
          {vinhetaSel.temAudio ?
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
              Áudio enviado — use ▶ para ouvir ou «trocar» para substituir.
            </p>
          : vinhetaSel.tipo === "audio" ?
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Envie o MP3 com «trocar» ou escolha outra vinheta.</p>
          : null}
        </div>
      : vinhetaId ?
        <p className="mt-2 text-xs text-slate-400">Carregando vinheta…</p>
      : null}
      {bibOpen ?
        <ImportVinhetaClientesModal
          programacaoId={programacaoId}
          onClose={() => setBibOpen(false)}
          onImported={async (id) => {
            setBibOpen(false);
            setVinhetaId(id);
            await load();
          }}
        />
      : null}
    </section>
  );
}

function VinhetaPastasBlock({
  programacaoId,
  onEdit,
}: {
  programacaoId: string;
  onEdit?: () => void | Promise<void>;
}) {
  const [pastas, setPastas] = useState<VinhetaPastaView[]>([]);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [bibForPasta, setBibForPasta] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/criacao/programacoes/${programacaoId}/vinheta-pastas`);
    if (!res.ok) return;
    const d = (await res.json()) as { pastas: VinhetaPastaView[] };
    setPastas(d.pastas ?? []);
  }, [programacaoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function criarPasta() {
    if (!nome.trim() || busy) return;
    setBusy(true);
    try {
      await onEdit?.();
      await fetch(`/api/criacao/programacoes/${programacaoId}/vinheta-pastas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      setNome("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addVinhetaExistente(pastaId: string, vinhetaId: string) {
    setBusy(true);
    try {
      await onEdit?.();
      await fetch(`/api/criacao/programacoes/${programacaoId}/vinheta-pastas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_vinheta", vinhetaPastaId: pastaId, vinhetaId }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Pasta de vinhetas</h3>
      <p className="mt-1 text-xs text-slate-500">
        Várias vinhetas em sequência (1 → 2 → 3…). Use o cronograma abaixo com alvo «Pasta de vinhetas» e intervalo por tempo ou
        por músicas.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da pasta (ex.: Avisos rotativos)"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          type="button"
          disabled={busy || !nome.trim()}
          onClick={() => void criarPasta()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          + Pasta
        </button>
      </div>
      {pastas.length === 0 ?
        <p className="mt-4 text-xs text-slate-400">Nenhuma pasta de vinhetas ainda.</p>
      : <ul className="mt-4 space-y-3">
          {pastas.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-sm">{p.nome}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setBibForPasta(p.id)}
                    className="rounded border border-violet-300 px-2 py-1 text-[11px] font-semibold text-violet-900 dark:border-violet-800"
                  >
                    + Vinhetas clientes
                  </button>
                  <AddVinhetaExistenteSelect
                    programacaoId={programacaoId}
                    disabled={busy}
                    onPick={(vinhetaId) => void addVinhetaExistente(p.id, vinhetaId)}
                  />
                </div>
              </div>
              {p.vinhetas.length === 0 ?
                <p className="mt-2 text-xs text-slate-400">Sem vinhetas na pasta.</p>
              : <ol className="mt-2 list-decimal pl-5 text-xs text-slate-600 dark:text-slate-300">
                  {p.vinhetas.map((v) => (
                    <li key={v.id}>
                      {v.nome}
                      {!v.temAudio ?
                        <span className="ml-1 text-amber-600">(sem áudio)</span>
                      : null}
                    </li>
                  ))}
                </ol>
              }
            </li>
          ))}
        </ul>
      }
      {bibForPasta ?
        <ImportVinhetaClientesModal
          programacaoId={programacaoId}
          onClose={() => setBibForPasta(null)}
          onImported={async (vinhetaId) => {
            const pastaId = bibForPasta;
            setBibForPasta(null);
            await addVinhetaExistente(pastaId, vinhetaId);
          }}
        />
      : null}
    </section>
  );
}

function AddVinhetaExistenteSelect({
  programacaoId,
  disabled,
  onPick,
}: {
  programacaoId: string;
  disabled: boolean;
  onPick: (vinhetaId: string) => void;
}) {
  const [vinhetas, setVinhetas] = useState<VinhetaOpt[]>([]);
  useEffect(() => {
    void fetch(`/api/criacao/programacoes/${programacaoId}/vinhetas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVinhetas((d as { vinhetas?: VinhetaOpt[] })?.vinhetas ?? []));
  }, [programacaoId]);
  return (
    <select
      disabled={disabled || vinhetas.length === 0}
      defaultValue=""
      onChange={(e) => {
        const id = e.target.value;
        if (id) onPick(id);
        e.target.value = "";
      }}
      className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-950"
    >
      <option value="">+ Vinheta única…</option>
      {vinhetas.map((v) => (
        <option key={v.id} value={v.id}>
          {v.nome}
        </option>
      ))}
    </select>
  );
}

export function ImportVinhetaClientesModal({
  programacaoId,
  onClose,
  onImported,
}: {
  programacaoId: string;
  onClose: () => void;
  onImported: (vinhetaId: string) => void | Promise<void>;
}) {
  const [items, setItems] = useState<
    { musicaId: string; titulo: string; artista: string; previewUrl: string | null }[]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/criacao/biblioteca/vinhetas-clientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems((d as { items?: typeof items })?.items ?? []));
  }, []);

  async function importar(musicaId: string, label: string) {
    setBusy(musicaId);
    try {
      const res = await fetch(
        `/api/criacao/programacoes/${programacaoId}/vinhetas/from-vinheta-cliente`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ musicaId, nome: label }),
        },
      );
      const raw = await res.text();
      let d = {} as { vinheta?: { id: string }; error?: string };
      try {
        d = JSON.parse(raw) as typeof d;
      } catch {
        d = { error: res.status === 404 ? "rota_nao_encontrada" : "copia_falhou" };
      }
      if (!res.ok || !d.vinheta?.id) {
        alert(vinhetaClienteImportErrorMessage(d.error ?? "copia_falhou"));
        return;
      }
      await onImported(d.vinheta.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold">Vinhetas clientes (biblioteca)</h4>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </div>
        {items.length === 0 ?
          <p className="text-sm text-slate-500">
            Nenhuma faixa na pasta Vinhetas clientes. Envie em Criação → Upload → destino Vinhetas.
          </p>
        : <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((it) => (
              <li key={it.musicaId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <strong>{it.titulo}</strong>
                  {it.artista ?
                    <span className="text-slate-500"> · {it.artista}</span>
                  : null}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void importar(it.musicaId, it.titulo)}
                  className="shrink-0 rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === it.musicaId ? "…" : "Usar"}
                </button>
              </li>
            ))}
          </ul>
        }
      </div>
    </div>
  );
}
