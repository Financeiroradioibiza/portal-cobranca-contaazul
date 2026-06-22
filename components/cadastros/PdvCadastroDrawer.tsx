"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProducaoPdvCadastroDto } from "@/lib/cadastros/producaoPdvCadastroService";
import { CopyTextButton } from "@/components/CopyTextButton";

type Props = {
  rioPdvKey: string | null;
  editMode: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

function boolSelect(
  value: boolean,
  onChange: (v: boolean) => void,
  disabled: boolean,
) {
  return (
    <select
      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950"
      value={value ? "sim" : "nao"}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "sim")}
    >
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function PdvCadastroDrawer({ rioPdvKey, editMode, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProducaoPdvCadastroDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (key: string, refreshCobranca: boolean) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `/api/cadastros/producao/pdv/${encodeURIComponent(key)}/cadastro?refreshCobranca=${refreshCobranca ? "1" : "0"}`,
      );
      const data = (await res.json()) as { ok?: boolean; cadastro?: ProducaoPdvCadastroDto; error?: string };
      if (!res.ok || !data.ok || !data.cadastro) throw new Error(data.error ?? "load_erro");
      setForm(data.cadastro);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar cadastro.");
      setForm(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!rioPdvKey) {
      setForm(null);
      return;
    }
    void load(rioPdvKey, true);
  }, [rioPdvKey, load]);

  async function save() {
    if (!form || !rioPdvKey || !editMode) return;
    setBusy(true);
    setMsg("");
    try {
      const { rioPdvKey: _k, cobrancaFromCa: _c, programacaoMusical: _p, ...patch } = form;
      const res = await fetch(
        `/api/cadastros/producao/pdv/${encodeURIComponent(rioPdvKey)}/cadastro`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "save_erro");
      setMsg("Cadastro salvo.");
      onSaved?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function refazerSerial() {
    if (!rioPdvKey || !editMode || busy) return;
    if (
      !window.confirm(
        "Gera uma nova chave serial de instalação. O player instalado deixa de funcionar até ser reinstalado com a nova chave. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `/api/cadastros/producao/pdv/${encodeURIComponent(rioPdvKey)}/cadastro/regenerar-token`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        playerInstalacaoToken?: string;
        gatewaySyncError?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.playerInstalacaoToken) {
        throw new Error(data.error ?? "falhou");
      }
      setForm((prev) =>
        prev ?
          { ...prev, playerInstalacaoToken: data.playerInstalacaoToken!, playerInstaladoEm: null }
        : prev,
      );
      if (data.gatewaySyncError) {
        setMsg(
          `Nova chave gerada no portal, mas o player instalado pode continuar tocando até o sync com o cloud2 (${data.gatewaySyncError}). Tente «Sync gateway» ou contacte suporte.`,
        );
      } else {
        setMsg("Nova chave serial gerada. O player instalado será desconectado no próximo ping.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao refazer serial.");
    } finally {
      setBusy(false);
    }
  }

  if (!rioPdvKey) return null;

  const disabled = !editMode || busy;

  return (
    <div className="flex h-full w-[min(420px,42vw)] shrink-0 flex-col border-l border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div>
          <p className="text-[9px] font-bold uppercase text-violet-700 dark:text-violet-300">
            Cadastro PDV
          </p>
          <p className="text-xs text-slate-500">
            {editMode ? "Modo edição ativo" : "Ative «Editar produção» para alterar"}
          </p>
        </div>
        <button type="button" className="text-xs text-slate-500 hover:underline" onClick={onClose}>
          Fechar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {busy && !form ?
          <p className="text-sm text-slate-500">Carregando…</p>
        : !form ?
          <p className="text-sm text-rose-700">{msg || "Sem dados."}</p>
        : <div className="space-y-3">
            <Field label="Nome do PDV">
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.nome}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Field>
            <p className="rounded border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
              A programação musical é definida em <strong>Criação → Programações</strong> e publicada no
              Player 5 — não neste cadastro.
            </p>

            <p className="text-[10px] font-bold uppercase text-slate-400">Endereço</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="CEP">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.cep}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                />
              </Field>
              <Field label="Número">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.numero}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Endereço">
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.endereco}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Complemento">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.complemento}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                />
              </Field>
              <Field label="Bairro">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.bairro}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                />
              </Field>
              <Field label="Cidade">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.cidade}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </Field>
              <Field label="Estado">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.estado}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Razão social">
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.razaoSocial}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
              />
            </Field>
            <Field label="CNPJ">
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.cnpj}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Placa de carro">{boolSelect(form.placaCarro, (v) => setForm({ ...form!, placaCarro: v }), disabled)}</Field>
              <Field label="Controlar player">{boolSelect(form.controlarPlayer, (v) => setForm({ ...form!, controlarPlayer: v }), disabled)}</Field>
              <Field label="Controlar playlist">{boolSelect(form.controlarPlaylist, (v) => setForm({ ...form!, controlarPlaylist: v }), disabled)}</Field>
              <Field label="Status player">
                <select
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.statusPlayer}
                  disabled={disabled}
                  onChange={(e) =>
                    setForm({ ...form, statusPlayer: e.target.value as "Ativo" | "Inativo" })
                  }
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </Field>
            </div>

            <Field label="Aviso codificado (Player)">
              <select
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.playerContatoExtraCodigo}
                disabled={disabled}
                onChange={(e) =>
                  setForm({
                    ...form,
                    playerContatoExtraCodigo: e.target.value as ProducaoPdvCadastroDto["playerContatoExtraCodigo"],
                  })
                }
              >
                <option value="">Nenhum</option>
                <option value="ALERTACORTE">ALERTACORTE — cobrança em aberto</option>
                <option value="CADASTRO">CADASTRO — cadastro desatualizado</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                Só aparece no player quando Controlar player e Controlar playlist estão «Sim».
              </p>
            </Field>

            <p className="text-[10px] font-bold uppercase text-slate-400">Player — instalação</p>
            <Field label="Chave serial (token de instalação)">
              <div className="flex items-center gap-1">
                <input
                  className="min-w-0 flex-1 rounded border border-slate-300 bg-slate-100 px-2 py-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                  value={form.playerInstalacaoToken}
                  readOnly
                />
                {form.playerInstalacaoToken ?
                  <CopyTextButton
                    size="compact"
                    variant="icon"
                    text={form.playerInstalacaoToken}
                    label="Copiar serial"
                  />
                : null}
              </div>
            </Field>
            {form.playerInstaladoEm ?
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Instalado em{" "}
                {new Date(form.playerInstaladoEm).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            : <p className="text-[11px] text-slate-500">Ainda não instalado no player.</p>}
            {editMode ?
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                onClick={() => void refazerSerial()}
              >
                Refazer serial
              </button>
            : null}
            <p className="text-[10px] text-slate-400">
              Como no painel legado: o player amarra esta chave na 1ª instalação. Refazer desamarra e exige
              nova instalação.
            </p>

            <p className="text-[10px] font-bold uppercase text-slate-400">Contato loja</p>
            <Field label="Nome">
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.contatoLojaNome}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, contatoLojaNome: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="E-mail">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.contatoLojaEmail}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, contatoLojaEmail: e.target.value })}
                />
              </Field>
              <Field label="Telefone">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.contatoLojaTelefone}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, contatoLojaTelefone: e.target.value })}
                />
              </Field>
            </div>

            <p className="text-[10px] font-bold uppercase text-slate-400">
              Contato cobrança {form.cobrancaFromCa ? "(Conta Azul)" : ""}
            </p>
            <Field label="Nome">
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.contatoCobrancaNome}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, contatoCobrancaNome: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="E-mail">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.contatoCobrancaEmail}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, contatoCobrancaEmail: e.target.value })}
                />
              </Field>
              <Field label="Telefone">
                <input
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.contatoCobrancaTelefone}
                  disabled={disabled}
                  onChange={(e) => setForm({ ...form, contatoCobrancaTelefone: e.target.value })}
                />
              </Field>
            </div>
            {editMode ?
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-md bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                onClick={() => void save()}
              >
                {busy ? "Salvando…" : "Salvar cadastro PDV"}
              </button>
            : null}
            {editMode ?
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white dark:border-slate-600"
                onClick={() => rioPdvKey && void load(rioPdvKey, true)}
              >
                Atualizar cobrança da Conta Azul
              </button>
            : null}
          </div>
        }
        {msg ?
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{msg}</p>
        : null}
      </div>
    </div>
  );
}
