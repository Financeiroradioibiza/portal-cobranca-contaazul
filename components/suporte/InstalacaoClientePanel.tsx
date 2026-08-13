"use client";

import { useCallback, useEffect, useState } from "react";
import {
  INSTALACAO_TIPOS,
  type ElectronAuthModo,
} from "@/lib/suporte/instalacaoTipos";
import type { InstalacaoTipo } from "@/lib/suporte/instalacaoService";

type SelectedClient = {
  portalClienteId: number;
  clienteNome: string;
};

type PdvResumo = {
  portalPdvId: number;
  codigoDisplay: string;
  pdvNome: string;
  contatoLojaEmail: string;
  podeGerarCodigoPlay: boolean;
  playerInstaladoEm: string | null;
};

type RowStatus = "idle" | "running" | "ok" | "err" | "skip";

type PdvBatchRow = PdvResumo & {
  emailOverride: string;
  link: string;
  senhaTemp: string;
  codigoPlay: string;
  linkStatus: RowStatus;
  linkError: string;
  emailStatus: RowStatus;
  emailError: string;
};

type Status = { kind: "ok" | "err"; text: string } | null;

type Plataforma = "windows" | "mobile";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/40";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BATCH_DELAY_MS = 450;

const CLIENTE_TIPOS = INSTALACAO_TIPOS.filter((t) => t.id !== "padrao_cliente");

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function mapErr(data: unknown): string {
  const err = (data as { error?: unknown })?.error;
  if (err === "cliente_sem_pdvs") return "Este cliente não tem PDVs com ID Player.";
  if (err === "pdv_com_player_instalado") {
    return "PDV com player instalado — regenerar chave serial antes de gerar código Play.";
  }
  if (err === "email_invalido") return "E-mail de destino inválido.";
  if (err === "smtp_nao_configurado") return "SMTP não configurado no ambiente (OC_EMAIL_SMTP_*).";
  if (err === "envio_falhou") {
    const detail = (data as { detail?: unknown })?.detail;
    return typeof detail === "string" && detail.trim()
      ? `Falha ao enviar e-mail: ${detail.trim()}`
      : "Falha ao enviar e-mail (SMTP).";
  }
  if (typeof err === "string" && err.trim()) return err;
  return "Operação falhou.";
}

async function postInstalacao(body: Record<string, unknown>) {
  const res = await fetch("/api/suporte/instalacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { res, data };
}

function statusBadge(status: RowStatus, label: string) {
  if (status === "idle") return null;
  const cls =
    status === "running" ? "text-sky-300"
    : status === "ok" ? "text-emerald-300"
    : status === "skip" ? "text-zinc-500"
    : "text-red-300";
  return <span className={`text-[11px] ${cls}`}>{label}</span>;
}

export function InstalacaoClientePanel({ client }: { client: SelectedClient }) {
  const [clienteNome, setClienteNome] = useState(client.clienteNome);
  const [rows, setRows] = useState<PdvBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );

  const [tipo, setTipo] = useState<InstalacaoTipo>("pdv_senha_temp");
  const [electronAuth, setElectronAuth] = useState<ElectronAuthModo>("temp");

  const plataforma: Plataforma = tipo === "pdv_play5" ? "mobile" : "windows";

  const loadPdvs = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const { res, data } = await postInstalacao({
        action: "contexto_cliente",
        portalClienteId: client.portalClienteId,
      });
      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        setRows([]);
        setStatus({ kind: "err", text: mapErr(data) });
        return;
      }
      const d = data as { clienteNome?: string; pdvs?: PdvResumo[] };
      setClienteNome(d.clienteNome?.trim() || client.clienteNome);
      const pdvs = Array.isArray(d.pdvs) ? d.pdvs : [];
      setRows(
        pdvs.map((p) => ({
          ...p,
          emailOverride: p.contatoLojaEmail?.trim() ?? "",
          link: "",
          senhaTemp: "",
          codigoPlay: "",
          linkStatus: "idle" as RowStatus,
          linkError: "",
          emailStatus: "idle" as RowStatus,
          emailError: "",
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [client.portalClienteId, client.clienteNome]);

  useEffect(() => {
    void loadPdvs();
  }, [loadPdvs]);

  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        link: "",
        senhaTemp: "",
        codigoPlay: "",
        linkStatus: "idle",
        linkError: "",
        emailStatus: "idle",
        emailError: "",
      })),
    );
  }, [tipo, electronAuth]);

  async function handleGerarLinksTodos() {
    if (rows.length === 0) return;
    setBusy(true);
    setStatus(null);
    setProgress({ done: 0, total: rows.length, label: "Gerando links…" });

    let ok = 0;
    let err = 0;
    let skip = 0;
    let batchRows = [...rows];

    for (let i = 0; i < batchRows.length; i++) {
      const r = batchRows[i]!;
      setProgress({ done: i, total: batchRows.length, label: `Gerando — ${r.pdvNome}` });
      batchRows = batchRows.map((row) =>
        row.portalPdvId === r.portalPdvId ? { ...row, linkStatus: "running" as RowStatus, linkError: "" } : row,
      );
      setRows(batchRows);

      if (tipo === "pdv_play5" && !r.podeGerarCodigoPlay) {
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? { ...row, linkStatus: "skip" as RowStatus, linkError: "Player já instalado" }
            : row,
        );
        setRows(batchRows);
        skip++;
        continue;
      }

      const { res, data } = await postInstalacao({
        action: "gerar_link",
        portalClienteId: client.portalClienteId,
        portalPdvId: r.portalPdvId,
        tipo,
        plataforma,
        electronAuth: tipo === "electron_ti" ? electronAuth : undefined,
      });

      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? { ...row, linkStatus: "err" as RowStatus, linkError: mapErr(data) }
            : row,
        );
        setRows(batchRows);
        err++;
      } else {
        const d = data as {
          link?: string;
          senhaTemporaria?: string;
          codigoPlay?: string;
        };
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? {
                ...row,
                linkStatus: "ok" as RowStatus,
                link: d.link ?? "",
                senhaTemp: d.senhaTemporaria ?? "",
                codigoPlay: d.codigoPlay ?? "",
              }
            : row,
        );
        setRows(batchRows);
        ok++;
      }

      if (i < batchRows.length - 1) await sleep(BATCH_DELAY_MS);
    }

    setProgress(null);
    setBusy(false);
    setStatus({
      kind: err > 0 ? "err" : "ok",
      text: `Links: ${ok} ok · ${skip} ignorados · ${err} erro(s).`,
    });
  }

  async function handleEnviarEmailsTodos() {
    if (rows.length === 0) return;
    setBusy(true);
    setStatus(null);
    setProgress({ done: 0, total: rows.length, label: "Enviando e-mails…" });

    let ok = 0;
    let err = 0;
    let skip = 0;
    let batchRows = [...rows];

    for (let i = 0; i < batchRows.length; i++) {
      const r = batchRows[i]!;
      setProgress({ done: i, total: batchRows.length, label: `Enviando — ${r.pdvNome}` });
      batchRows = batchRows.map((row) =>
        row.portalPdvId === r.portalPdvId ? { ...row, emailStatus: "running" as RowStatus, emailError: "" } : row,
      );
      setRows(batchRows);

      const destino = (r.emailOverride.trim() || r.contatoLojaEmail.trim());
      if (!EMAIL_RE.test(destino)) {
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? { ...row, emailStatus: "skip" as RowStatus, emailError: "Sem e-mail válido" }
            : row,
        );
        setRows(batchRows);
        skip++;
        continue;
      }

      if (tipo === "pdv_play5" && !r.podeGerarCodigoPlay && !r.codigoPlay) {
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? { ...row, emailStatus: "skip" as RowStatus, emailError: "Player já instalado" }
            : row,
        );
        setRows(batchRows);
        skip++;
        continue;
      }

      const { res, data } = await postInstalacao({
        action: "enviar_email",
        portalClienteId: client.portalClienteId,
        portalPdvId: r.portalPdvId,
        tipo,
        plataforma,
        electronAuth: tipo === "electron_ti" ? electronAuth : undefined,
        email: destino,
        senhaTemporaria: r.senhaTemp || undefined,
        codigoPlay: tipo === "pdv_play5" ? r.codigoPlay || undefined : undefined,
      });

      if (!res.ok || !(data as { ok?: boolean })?.ok) {
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? { ...row, emailStatus: "err" as RowStatus, emailError: mapErr(data) }
            : row,
        );
        setRows(batchRows);
        err++;
      } else {
        const d = data as {
          senhaTemporaria?: string;
          link?: string;
          codigoPlay?: string;
        };
        batchRows = batchRows.map((row) =>
          row.portalPdvId === r.portalPdvId
            ? {
                ...row,
                emailStatus: "ok" as RowStatus,
                senhaTemp: d.senhaTemporaria ?? row.senhaTemp,
                link: d.link ?? row.link,
                codigoPlay: d.codigoPlay ?? row.codigoPlay,
              }
            : row,
        );
        setRows(batchRows);
        ok++;
      }

      if (i < batchRows.length - 1) await sleep(BATCH_DELAY_MS);
    }

    setProgress(null);
    setBusy(false);
    setStatus({
      kind: err > 0 ? "err" : "ok",
      text: `E-mails: ${ok} enviados · ${skip} ignorados · ${err} erro(s).`,
    });
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Carregando PDVs do cliente…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-red-300">
        Nenhum PDV com ID Player para este cliente.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-300">
        <span className="font-medium text-zinc-100">{clienteNome}</span>
        <span className="text-zinc-500"> · {rows.length} PDV(s) · Cliente {client.portalClienteId}</span>
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">2. Tipo de instalação</h2>
        <p className="mb-3 text-[12px] text-zinc-500">
          Um link (ou código Play) por PDV — processados um de cada vez para evitar timeout.
        </p>
        <div className="space-y-2">
          {CLIENTE_TIPOS.map((t) => (
            <label
              key={t.id}
              className={
                "flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 " +
                (tipo === t.id
                  ? "border-fuchsia-600/70 bg-fuchsia-950/20"
                  : "border-zinc-700 hover:border-zinc-600")
              }
            >
              <input
                type="radio"
                name="tipo-cliente"
                className="mt-1"
                checked={tipo === t.id}
                onChange={() => setTipo(t.id)}
                disabled={busy}
              />
              <span className="text-sm">
                <span className="font-medium text-zinc-100">{t.label}</span>
                <span className="mt-0.5 block text-[12px] text-zinc-400">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {tipo === "electron_ti" ? (
          <div className="mt-4 rounded-lg border border-violet-800/50 bg-violet-950/20 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
              Autenticação no Player (.exe)
            </p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="electronAuthCliente"
                  className="mt-1"
                  checked={electronAuth === "temp"}
                  onChange={() => setElectronAuth("temp")}
                  disabled={busy}
                />
                <span>Senha temporária (recomendado)</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="electronAuthCliente"
                  className="mt-1"
                  checked={electronAuth === "login"}
                  onChange={() => setElectronAuth("login")}
                  disabled={busy}
                />
                <span>Login e senha do cliente</span>
              </label>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGerarLinksTodos()}
            className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
          >
            {tipo === "pdv_play5" ? "Gerar códigos Play para todos" : "Gerar links para todos"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">3. E-mail por loja</h2>
        <p className="mb-3 text-[12px] text-zinc-500">
          Confira ou altere o e-mail de cada PDV. Envios também rodam um de cada vez.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-xs text-zinc-500">
                <th className="py-2 pr-3 font-medium">PDV</th>
                <th className="py-2 pr-3 font-medium">E-mail</th>
                <th className="py-2 pr-3 font-medium">Link / código</th>
                <th className="py-2 font-medium">Envio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.portalPdvId} className="border-b border-zinc-800/80 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-zinc-100">{r.pdvNome}</p>
                    <p className="font-mono text-[10px] text-zinc-500">{r.codigoDisplay}</p>
                    {tipo === "pdv_play5" && !r.podeGerarCodigoPlay ? (
                      <p className="mt-1 text-[10px] text-amber-400">Player instalado</p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="email"
                      value={r.emailOverride}
                      disabled={busy}
                      onChange={(e) => {
                        const emailOverride = e.target.value;
                        setRows((prev) =>
                          prev.map((row) =>
                            row.portalPdvId === r.portalPdvId ? { ...row, emailOverride } : row,
                          ),
                        );
                      }}
                      placeholder={r.contatoLojaEmail || "loja@exemplo.com"}
                      className={inputClass + " min-w-[180px] text-xs"}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {r.codigoPlay ? (
                      <span className="font-mono text-xs text-fuchsia-200">{r.codigoPlay}</span>
                    ) : r.link ? (
                      <span className="break-all font-mono text-[10px] text-emerald-300">{r.link}</span>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                    {r.senhaTemp ? (
                      <p className="mt-1 font-mono text-[10px] text-fuchsia-300">Senha: {r.senhaTemp}</p>
                    ) : null}
                    {statusBadge(r.linkStatus, r.linkError || "Gerando…")}
                  </td>
                  <td className="py-2">
                    {statusBadge(
                      r.emailStatus,
                      r.emailError || (r.emailStatus === "ok" ? "Enviado" : "Enviando…"),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleEnviarEmailsTodos()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Enviar e-mail para todos
          </button>
          <p className="mt-2 text-[11px] text-zinc-500">
            PDVs sem e-mail válido são ignorados. O envio gera link/senha/código automaticamente se
            ainda não existir.
          </p>
        </div>
      </section>

      {progress ? (
        <div className="rounded-lg border border-sky-800/50 bg-sky-950/30 px-4 py-3">
          <p className="text-sm text-sky-100">
            {progress.label} ({progress.done + 1}/{progress.total})
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${Math.round(((progress.done + 1) / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {status ? (
        <p
          className={
            "rounded-lg px-3 py-2 text-sm " +
            (status.kind === "ok"
              ? "bg-emerald-950/40 text-emerald-200"
              : "bg-red-950/40 text-red-200")
          }
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
