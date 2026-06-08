"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    __RADIO_PAINEL_PROXY_SECRET?: string;
  }
}

type ClienteCand = { clienteId: string; textoLinha: string };
type PdvCand = { clienteId: string; pdvId: string; textoLinha: string };

type Tab = "cNome" | "cId" | "pNome" | "pId";

function painelHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined" && window.__RADIO_PAINEL_PROXY_SECRET) {
    h["x-radio-painel-secret"] = window.__RADIO_PAINEL_PROXY_SECRET;
  }
  return h;
}

async function painelPost(body: Record<string, unknown>) {
  const res = await fetch("/api/radio-painel/query", {
    method: "POST",
    credentials: "same-origin",
    headers: painelHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { _raw: text };
  }
  return { res, data };
}

function fmtCliente(res: Record<string, unknown>) {
  const nome = String(res.nomeCliente ?? "");
  const tel = String(res.telefone ?? "");
  const linhas = [`Nome: ${nome || "—"}`, `Telefone: ${tel || "—"}`];
  const extras = Array.isArray(res.contatosExtras) ? res.contatosExtras : [];
  extras.forEach((ex, i) => {
    const e = ex as Record<string, unknown>;
    linhas.push("");
    linhas.push(`Contato extra ${i + 1}`);
    linhas.push(`· Setor / cargo: ${String(e.setorOuCargo ?? "—")}`);
    linhas.push(`· Nome completo: ${String(e.nomeCompleto ?? "—")}`);
    linhas.push(`· Telefone fixo: ${String(e.telefoneFixo ?? "—")}`);
    linhas.push(`· Telefone móvel: ${String(e.telefoneMovel ?? "—")}`);
    linhas.push(`· E-mail: ${String(e.email ?? "—")}`);
  });
  return linhas.join("\n");
}

function fmtPdv(r: Record<string, unknown>) {
  const R = (r.responsavel as Record<string, unknown>) || {};
  const linhas = [
    `Nome do PDV: ${String(r.nomePdv ?? "—")}`,
    `CNPJ: ${String(r.cnpj ?? "—")}`,
    "",
    `Responsável — nome completo: ${String(R.nomeCompleto ?? "—")}`,
    `Responsável — e-mail: ${String(R.email ?? "—")}`,
    `Responsável — tel. fixo: ${String(R.telefoneFixo ?? "—")}`,
    `Responsável — tel. móvel: ${String(R.telefoneMovel ?? "—")}`,
  ];
  const extras = Array.isArray(r.contatosExtras) ? r.contatosExtras : [];
  extras.forEach((ex, i) => {
    const e = ex as Record<string, unknown>;
    linhas.push("");
    linhas.push(`Contato extra ${i + 1}`);
    linhas.push(`· Setor / cargo: ${String(e.setorOuCargo ?? "—")}`);
    linhas.push(`· Nome completo: ${String(e.nomeCompleto ?? "—")}`);
    linhas.push(`· E-mail: ${String(e.email ?? "—")}`);
    linhas.push(`· Tel. fixo: ${String(e.telefoneFixo ?? "—")}`);
    linhas.push(`· Tel. móvel: ${String(e.telefoneMovel ?? "—")}`);
  });
  return linhas.join("\n");
}

type ConsultaPainelDialogProps = {
  /** Página dedicada: abre o modal ao carregar. */
  openOnMount?: boolean;
  /** Oculta o botão «Consulta painel» (uso em /cobranca/consulta-painel). */
  hideTrigger?: boolean;
};

export function ConsultaPainelDialog({ openOnMount, hideTrigger }: ConsultaPainelDialogProps = {}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>("cNome");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chooseCli, setChooseCli] = useState<ClienteCand[]>([]);
  const [choosePdv, setChoosePdv] = useState<PdvCand[]>([]);
  const [out, setOut] = useState<string>("");
  const [mapsHidden, setMapsHidden] = useState(true);
  const [mapsUrl, setMapsUrl] = useState("");

  const open = () => {
    setErr(null);
    setOut("");
    setChooseCli([]);
    setChoosePdv([]);
    setMapsHidden(true);
    setMapsUrl("");
    dlg.current?.showModal?.();
  };

  const close = () => dlg.current?.close();

  useEffect(() => {
    if (!openOnMount) return;
    dlg.current?.showModal?.();
  }, [openOnMount]);

  const setError = useCallback((msg: string) => {
    setErr(msg);
    setOut("");
    setChooseCli([]);
    setChoosePdv([]);
    setMapsHidden(true);
    setMapsUrl("");
  }, []);

  const clientePorId = useCallback(async (clienteId: string) => {
    setBusy(true);
    setErr(null);
    setChooseCli([]);
    setChoosePdv([]);
    try {
      const { res, data } = await painelPost({
        mode: "clienteId",
        clienteId,
      });
      if (!res.ok) {
        setError(String(data.error || `Erro ${res.status}`));
        return;
      }
      if (data.ok && data.tipo === "cliente" && data.resultado) {
        setOut(fmtCliente(data.resultado as Record<string, unknown>));
        setMapsHidden(true);
        return;
      }
      setError(typeof data.error === "string" ? data.error : JSON.stringify(data));
    } finally {
      setBusy(false);
    }
  }, [setError]);

  const pdvPorIds = useCallback(
    async (pdvId: string, clienteId?: string) => {
      setBusy(true);
      setErr(null);
      setChooseCli([]);
      setChoosePdv([]);
      try {
        const body: Record<string, unknown> = { mode: "pdv", pdvId };
        if (clienteId && /^\d+$/.test(clienteId)) body.clienteId = clienteId;
        const { res, data } = await painelPost(body);
        if (!res.ok || !data.ok || data.tipo !== "pdv" || !data.resultado) {
          setError(
            String(data.error || (data.tipo !== "pdv" ? JSON.stringify(data) : "Erro PDV")),
          );
          return;
        }
        const r = data.resultado as Record<string, unknown>;
        const q =
          typeof r.googleMapsQuery === "string"
            ? r.googleMapsQuery
            : String(r.nomePdv ?? "");
        const maps =
          typeof r.googleMapsUrl === "string"
            ? r.googleMapsUrl
            : q
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
              : "";

        setOut(
          `${fmtPdv(r)}\n\n--- Google Maps ---\nTexto para buscar:\n${q || "(vazio)"}`,
        );
        setMapsUrl(maps);
        setMapsHidden(!maps);
      } finally {
        setBusy(false);
      }
    },
    [setError],
  );

  const clientePorNomeCsv = async (nome: string) => {
    setBusy(true);
    setErr(null);
    setChooseCli([]);
    setChoosePdv([]);
    setMapsHidden(true);
    setMapsUrl("");
    try {
      const { res, data } = await painelPost({ mode: "clienteNome", nome });
      if (!res.ok) {
        setError(String(data.error || `Erro ${res.status}`));
        return;
      }
      if (data.aviso && data.tipo === "cliente_vazio") {
        setError(String(data.aviso));
        return;
      }
      const list = Array.isArray(data.candidatos) ? (data.candidatos as ClienteCand[]) : [];
      if (data.tipo === "cliente_escolha" && list.length > 1) {
        setChooseCli(list);
        return;
      }
      if (data.tipo === "cliente" && data.resultado) {
        setOut(fmtCliente(data.resultado as Record<string, unknown>));
        return;
      }
      setError(JSON.stringify(data));
    } finally {
      setBusy(false);
    }
  };

  const pdvPorNomeCsv = async (nome: string) => {
    setBusy(true);
    setErr(null);
    setChooseCli([]);
    setChoosePdv([]);
    setMapsHidden(true);
    setMapsUrl("");
    try {
      const { res, data } = await painelPost({ mode: "pdvNome", nome });
      if (!res.ok) {
        setError(String(data.error || `Erro ${res.status}`));
        return;
      }
      if (data.aviso && data.tipo === "pdv_vazio") {
        setError(String(data.aviso));
        return;
      }
      const list = Array.isArray(data.candidatos) ? (data.candidatos as PdvCand[]) : [];
      if (data.tipo === "pdv_escolha" && list.length > 1) {
        setChoosePdv(list);
        return;
      }
      if (data.tipo === "pdv" && data.resultado) {
        const r = data.resultado as Record<string, unknown>;
        const q =
          typeof r.googleMapsQuery === "string"
            ? r.googleMapsQuery
            : String(r.nomePdv ?? "");
        const maps =
          typeof r.googleMapsUrl === "string"
            ? r.googleMapsUrl
            : q
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
              : "";
        setOut(
          `${fmtPdv(r)}\n\n--- Google Maps ---\nTexto para buscar:\n${q || "(vazio)"}`,
        );
        setMapsUrl(maps);
        setMapsHidden(!maps);
        return;
      }
      setError(JSON.stringify(data));
    } finally {
      setBusy(false);
    }
  };

  const subClienteNome = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const nome = String(fd.get("p_cli_n") ?? "").trim();
    if (nome.length < 2) {
      setError("Digite pelo menos 2 caracteres.");
      return;
    }
    void clientePorNomeCsv(nome);
  };

  const subClienteId = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const id = String(fd.get("p_cli_id") ?? "").trim();
    if (!/^\d+$/.test(id)) {
      setError("ID de cliente deve ser numero.");
      return;
    }
    void clientePorId(id);
  };

  const subPdvNome = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const nome = String(fd.get("p_pdv_n") ?? "").trim();
    if (nome.length < 2) {
      setError("Digite pelo menos 2 caracteres.");
      return;
    }
    void pdvPorNomeCsv(nome);
  };

  const subPdvId = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const pid = String(fd.get("p_pdv") ?? "").trim();
    let cid = String(fd.get("p_pdv_cli") ?? "").trim();
    if (!/^\d+$/.test(pid)) {
      setError("ID PDV invalido.");
      return;
    }
    const cidClean = /^\d+$/.test(cid) ? cid : undefined;
    void pdvPorIds(pid, cidClean);
  };

  return (
    <Fragment>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={open}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Consulta painel
        </button>
      )}

      <dialog
        ref={dlg}
        className="w-[min(640px,calc(100vw-24px))] rounded-xl border border-slate-200 bg-white p-0 text-sm text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Consulta Painel Ibiza</h2>
            <p className="mt-1 text-[0.72rem] text-slate-500 dark:text-slate-400">
              Nomes pelo export em <code className="text-[0.7rem]">data/export-clientes.csv</code>; detalhes
              continuam sendo lidos do painel ao vivo.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="-mr-1 rounded p-1 text-lg leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          {(
            [
              ["cNome", "Cliente (nome)"] as const,
              ["cId", "Cliente (ID)"] as const,
              ["pNome", "PDV (nome)"] as const,
              ["pId", "PDV (ID)"] as const,
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                setErr(null);
                setChooseCli([]);
                setChoosePdv([]);
              }}
              className={
                tab === k
                  ? "rounded-md border border-sky-500 bg-sky-50 px-2.5 py-1 text-[0.75rem] font-semibold text-slate-900 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-50"
                  : "rounded-md border border-transparent px-2.5 py-1 text-[0.75rem] font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
              }
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="max-h-[calc(70vh)] overflow-auto px-4 py-3">
          {tab === "cNome" ? (
            <form onSubmit={subClienteNome} className="space-y-2">
              <label className="block text-[0.7rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Nome cliente / razao / PDVs vinculados
                <input
                  name="p_cli_n"
                  placeholder="Ex.: Maria Filo..."
                  autoComplete="off"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <button
                disabled={busy}
                type="submit"
                className="rounded-lg bg-[#0284c7] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Buscar
              </button>
            </form>
          ) : null}

          {tab === "cId" ? (
            <form onSubmit={subClienteId} className="space-y-2">
              <label className="block text-[0.7rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                ID cliente painel
                <input
                  name="p_cli_id"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="1395"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <button
                disabled={busy}
                type="submit"
                className="rounded-lg bg-[#0284c7] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Consultar
              </button>
            </form>
          ) : null}

          {tab === "pNome" ? (
            <form onSubmit={subPdvNome} className="space-y-2">
              <label className="block text-[0.7rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Nome do PDV
                <input
                  name="p_pdv_n"
                  placeholder="Ex.: Shopping Tijuca"
                  autoComplete="off"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <button
                disabled={busy}
                type="submit"
                className="rounded-lg bg-[#0284c7] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Buscar
              </button>
            </form>
          ) : null}

          {tab === "pId" ? (
            <form
              className="space-y-2"
              onSubmit={subPdvId}
            >
              <label className="block text-[0.7rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                ID PDV
                <input
                  name="p_pdv"
                  inputMode="numeric"
                  placeholder="13855"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <label className="block text-[0.7rem] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                ID cliente (opcional)
                <input
                  name="p_pdv_cli"
                  inputMode="numeric"
                  placeholder="1485"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <button
                disabled={busy}
                type="submit"
                className="rounded-lg bg-[#0284c7] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Consultar
              </button>
            </form>
          ) : null}

          {busy ? (
            <p className="mt-3 text-xs text-slate-500">Carregando…</p>
          ) : null}

          {err ? (
            <div className="mt-3 whitespace-pre-wrap rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
              {err}
            </div>
          ) : null}

          {chooseCli.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-2 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-400">
                Vários candidatos — escolha:
              </p>
              <ul className="max-h-40 space-y-1 overflow-auto text-xs">
                {chooseCli.map((c) => (
                  <li key={`${c.clienteId}_${c.textoLinha.slice(0,40)}`}>
                    <button
                      type="button"
                      onClick={() => void clientePorId(c.clienteId)}
                      className="text-left text-sky-600 underline hover:no-underline dark:text-sky-400"
                    >
                      {c.textoLinha}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {choosePdv.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-2 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-400">
                Varios PDVs — escolha:
              </p>
              <ul className="max-h-52 space-y-1 overflow-auto text-xs">
                {choosePdv.map((p) => (
                  <li key={`${p.pdvId}_${p.clienteId}`}>
                    <button
                      type="button"
                      onClick={() =>
                        void pdvPorIds(p.pdvId, p.clienteId)
                      }
                      className="text-left text-sky-600 underline hover:no-underline dark:text-sky-400"
                    >
                      {p.textoLinha}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {out ? (
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
              <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-[0.75rem] dark:border-slate-700 dark:bg-slate-900/60">
                {out}
              </pre>
              {!mapsHidden && mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-[0.75rem] font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-900"
                >
                  Abrir no Google Maps
                </a>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 border-t border-slate-100 pt-3 text-[0.65rem] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Secreto opcional (Netlify igual):{' '}
            <code className="text-[0.65rem]">window.__RADIO_PAINEL_PROXY_SECRET=&quot;…&quot;</code>{' '}
            na consola do browser antes de usar, se usar <code>RADIO_PAINEL_PROXY_SECRET</code>.
          </p>
        </div>
      </dialog>
    </Fragment>
  );
}

