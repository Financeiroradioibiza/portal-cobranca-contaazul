"use client";

import { useEffect, useState } from "react";
import type { ContatoLojaResumo } from "@/lib/cadastros/contatosLojaExtras";
import type { LojaConciliarAlvo } from "@/lib/player/playerIngestService";
import type { MigracaoPdvContatoResumo } from "@/lib/suporte/migracaoService";

function fmtContatoLinha(c: ContatoLojaResumo): string {
  const parts = [c.nome, c.telefone, c.email].map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function principalVazio(contatos: ContatoLojaResumo[]): boolean {
  const p = contatos.find((c) => c.kind === "principal");
  if (!p) return true;
  return !p.nome.trim() && !p.email.trim() && !p.telefone.trim();
}

function defaultLojaAlvo(contatos: ContatoLojaResumo[]): LojaConciliarAlvo {
  return principalVazio(contatos) ? { tipo: "principal" } : { tipo: "novo_extra" };
}

function ContatoResumoBlock({ pdv }: { pdv: MigracaoPdvContatoResumo }) {
  const principal = pdv.contatos.find((c) => c.kind === "principal");
  const extras = pdv.contatos.filter((c) => c.kind === "extra");

  const inner =
    !principal && extras.length === 0 ?
      <span className="text-xs text-slate-400">Sem contato</span>
    : <div className="space-y-0.5">
        {principal ?
          <p
            className="text-xs text-slate-700 dark:text-slate-200"
            title={fmtContatoLinha(principal)}
          >
            <span className="font-medium text-slate-500">Gerente:</span> {fmtContatoLinha(principal)}
          </p>
        : null}
        {extras.length > 0 ?
          <p className="text-[10px] text-slate-500">
            +{extras.length} extra{extras.length === 1 ? "" : "s"}
          </p>
        : null}
      </div>;

  if (!pdv.instalado) return inner;

  return (
    <div className="rounded-md bg-emerald-200/95 px-2 py-1.5 dark:bg-emerald-900/85">{inner}</div>
  );
}

function MigracaoContatoLojaEditor({
  pdv,
  onClose,
  onSaved,
}: {
  pdv: MigracaoPdvContatoResumo;
  onClose: () => void;
  onSaved: (next: MigracaoPdvContatoResumo) => void;
}) {
  const [lojaAlvo, setLojaAlvo] = useState<LojaConciliarAlvo>(() => defaultLojaAlvo(pdv.contatos));
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (lojaAlvo.tipo === "principal") {
      const p = pdv.contatos.find((c) => c.kind === "principal");
      setNome(p?.nome ?? "");
      setEmail(p?.email ?? "");
      setTelefone(p?.telefone ?? "");
      return;
    }
    if (lojaAlvo.tipo === "extra") {
      const e = pdv.contatos.find((c) => c.id === lojaAlvo.extraId);
      setNome(e?.nome ?? "");
      setEmail(e?.email ?? "");
      setTelefone(e?.telefone ?? "");
      return;
    }
    setNome("");
    setEmail("");
    setTelefone("");
  }, [lojaAlvo, pdv.contatos]);

  async function salvar() {
    setBusy(true);
    setErro(null);
    try {
      const res = await fetch("/api/suporte/migracao/contato-loja", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rioPdvKey: pdv.rioPdvKey,
          lojaAlvo,
          contatoLojaNome: nome,
          contatoLojaEmail: email,
          contatoLojaTelefone: telefone,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        contatos?: ContatoLojaResumo[];
        pdvNome?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.contatos) {
        throw new Error(data.message ?? data.error ?? "Falha ao salvar.");
      }
      onSaved({
        rioPdvKey: pdv.rioPdvKey,
        pdvNome: data.pdvNome?.trim() || pdv.pdvNome,
        instalado: pdv.instalado,
        contatos: data.contatos,
      });
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  const extras = pdv.contatos.filter((c) => c.kind === "extra");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="migracao-contato-loja-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3
          id="migracao-contato-loja-titulo"
          className="text-sm font-bold text-slate-800 dark:text-slate-100"
        >
          Contato da loja — {pdv.pdvNome}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Alterações gravam no cadastro de produção do PDV (mesmo fluxo de conciliar contato).
        </p>

        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="text-[10px] font-bold uppercase text-slate-500">Aplicar como</p>
          <div className="mt-2 space-y-1.5">
            <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-700 dark:text-slate-200">
              <input
                type="radio"
                name={`lojaAlvo-${pdv.rioPdvKey}`}
                className="mt-0.5"
                checked={lojaAlvo.tipo === "principal"}
                disabled={busy}
                onChange={() => setLojaAlvo({ tipo: "principal" })}
              />
              <span>Atualizar gerente principal</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-700 dark:text-slate-200">
              <input
                type="radio"
                name={`lojaAlvo-${pdv.rioPdvKey}`}
                className="mt-0.5"
                checked={lojaAlvo.tipo === "novo_extra"}
                disabled={busy}
                onChange={() => setLojaAlvo({ tipo: "novo_extra" })}
              />
              <span>Adicionar contato extra</span>
            </label>
            {extras.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-700 dark:text-slate-200"
              >
                <input
                  type="radio"
                  name={`lojaAlvo-${pdv.rioPdvKey}`}
                  className="mt-0.5"
                  checked={lojaAlvo.tipo === "extra" && lojaAlvo.extraId === c.id}
                  disabled={busy}
                  onChange={() => setLojaAlvo({ tipo: "extra", extraId: c.id })}
                />
                <span>
                  Atualizar {c.label}
                  <span className="block text-[10px] text-slate-400">{c.nome || "—"}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">Nome</span>
            <input
              className="portal-input w-full text-sm"
              value={nome}
              disabled={busy}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">WhatsApp / telefone</span>
            <input
              className="portal-input w-full text-sm"
              value={telefone}
              disabled={busy}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">E-mail</span>
            <input
              type="email"
              className="portal-input w-full text-sm"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>

        {erro ?
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>
        : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="portal-btn portal-btn--secondary text-xs"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="portal-btn portal-btn--primary text-xs"
            disabled={busy}
            onClick={() => void salvar()}
          >
            {busy ? "Salvando…" : "Salvar contato"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MigracaoContatoLojaCell({
  pdvsContato,
  onPdvContatoSaved,
}: {
  pdvsContato: MigracaoPdvContatoResumo[];
  onPdvContatoSaved: (rioPdvKey: string, next: MigracaoPdvContatoResumo) => void;
}) {
  const [editando, setEditando] = useState<MigracaoPdvContatoResumo | null>(null);

  if (pdvsContato.length === 0) {
    return (
      <td className="px-3 py-2 align-top text-xs text-slate-400">
        Sem PDV instalável
      </td>
    );
  }

  return (
    <td className="px-3 py-2 align-top">
      <div className="space-y-2">
        {pdvsContato.map((pdv) => (
          <div key={pdv.rioPdvKey} className="min-w-[9rem] max-w-[14rem]">
            {pdvsContato.length > 1 ?
              <p
                className={
                  "truncate text-[10px] font-bold uppercase " +
                  (pdv.instalado ?
                    "text-amber-700 dark:text-amber-300"
                  : "text-slate-400")
                }
                title={pdv.pdvNome}
              >
                {pdv.pdvNome}
              </p>
            : null}
            <ContatoResumoBlock pdv={pdv} />
            <button
              type="button"
              className="mt-1 text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
              onClick={() => setEditando(pdv)}
            >
              Editar contato
            </button>
          </div>
        ))}
      </div>
      {editando ?
        <MigracaoContatoLojaEditor
          pdv={editando}
          onClose={() => setEditando(null)}
          onSaved={(next) => {
            onPdvContatoSaved(next.rioPdvKey, next);
          }}
        />
      : null}
    </td>
  );
}
