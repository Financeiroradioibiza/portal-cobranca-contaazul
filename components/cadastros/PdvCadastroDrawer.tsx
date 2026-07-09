"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidBrazilianCnpj, lookupCnpjReceita } from "@/lib/cadastros/cnpjLookup";
import type { ProducaoPdvCadastroDto } from "@/lib/cadastros/producaoPdvCadastroService";
import { onlyDigits } from "@/lib/format";

type Props = {
  rioPdvKey: string | null;
  editMode: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const CNPJ_LOOKUP_ERRORS: Record<string, string> = {
  cnpj_invalido: "CNPJ inválido — confira os 14 dígitos.",
  cnpj_nao_encontrado: "CNPJ não encontrado na Receita Federal.",
  cnpj_rate_limit: "Muitas consultas à Receita. Aguarde alguns segundos e tente de novo.",
  cnpj_lookup_falhou: "Não foi possível consultar a Receita. Verifique sua conexão e tente de novo.",
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
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      {children}
      {hint ?
        <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>
      : null}
    </label>
  );
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok ?
        "Resposta inválida do servidor."
      : `Erro ${res.status} ao comunicar com o servidor.`,
    );
  }
}

export function PdvCadastroDrawer({ rioPdvKey, editMode, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProducaoPdvCadastroDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [cnpjBusy, setCnpjBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const lastLookupDigitsRef = useRef("");

  const load = useCallback(async (key: string, refreshCobranca: boolean, forceCa = false) => {
    setBusy(true);
    setMsg("");
    try {
      const qs = new URLSearchParams({
        refreshCobranca: refreshCobranca ? "1" : "0",
        ...(forceCa ? { forceCa: "1" } : {}),
      });
      const res = await fetch(
        `/api/cadastros/producao/pdv/${encodeURIComponent(key)}/cadastro?${qs.toString()}`,
      );
      const data = await readJsonResponse<{
        ok?: boolean;
        cadastro?: ProducaoPdvCadastroDto;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.cadastro) throw new Error(data.error ?? "load_erro");
      setForm(data.cadastro);
      lastLookupDigitsRef.current = onlyDigits(data.cadastro.cnpj);
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

  const lookupCnpj = useCallback(
    async (raw?: string) => {
      if (!form || !editMode) return;
      const digits = onlyDigits(raw ?? form.cnpj);
      if (digits.length !== 14) {
        setMsg("Informe o CNPJ do PDV com 14 dígitos.");
        return;
      }
      if (!isValidBrazilianCnpj(digits)) {
        setMsg(CNPJ_LOOKUP_ERRORS.cnpj_invalido);
        return;
      }
      if (lastLookupDigitsRef.current === digits) return;

      setCnpjBusy(true);
      setMsg("Consultando endereço na Receita Federal…");
      try {
        const result = await lookupCnpjReceita(digits);
        if (!result.ok) {
          setMsg(CNPJ_LOOKUP_ERRORS[result.error] ?? CNPJ_LOOKUP_ERRORS.cnpj_lookup_falhou);
          return;
        }
        const row = result.data;
        lastLookupDigitsRef.current = digits;
        setForm((prev) =>
          prev ?
            {
              ...prev,
              cnpj: row.cnpj || prev.cnpj,
              razaoSocial: row.razaoSocial || prev.razaoSocial,
              nome: prev.nome.trim() || row.nomeFantasia || prev.nome,
              cep: row.cep || prev.cep,
              endereco: row.endereco || prev.endereco,
              numero: row.numero || prev.numero,
              complemento: row.complemento || prev.complemento,
              bairro: row.bairro || prev.bairro,
              cidade: row.cidade || prev.cidade,
              estado: row.uf || prev.estado,
            }
          : prev,
        );
        setMsg("Endereço e razão social importados da Receita Federal.");
      } catch {
        setMsg(CNPJ_LOOKUP_ERRORS.cnpj_lookup_falhou);
      } finally {
        setCnpjBusy(false);
      }
    },
    [form, editMode],
  );

  useEffect(() => {
    if (!form || !editMode) return;
    const digits = onlyDigits(form.cnpj);
    if (digits.length !== 14 || !isValidBrazilianCnpj(digits)) return;
    if (lastLookupDigitsRef.current === digits) return;
    const t = setTimeout(() => {
      void lookupCnpj(form.cnpj);
    }, 600);
    return () => clearTimeout(t);
  }, [form?.cnpj, form, editMode, lookupCnpj]);

  async function save() {
    if (!form || !rioPdvKey || !editMode) return;
    setBusy(true);
    setMsg("");
    try {
      const {
        rioPdvKey: _k,
        cobrancaFromCa: _c,
        programacaoMusical: _p,
        controlarPlayer: _cp,
        playerContatoExtraCodigo: _ace,
        ...patch
      } = form;
      const res = await fetch(
        `/api/cadastros/producao/pdv/${encodeURIComponent(rioPdvKey)}/cadastro`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const data = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error ?? "save_erro");
      setMsg("Cadastro salvo.");
      onSaved?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  if (!rioPdvKey) return null;

  const disabled = !editMode || busy || cnpjBusy;

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

            <Field
              label="CNPJ"
              hint="CNPJ da loja/PDV. Ao completar 14 dígitos, importa endereço e razão social da Receita."
            >
              <div className="flex flex-wrap gap-2">
                <input
                  className="min-w-[10rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  value={form.cnpj}
                  disabled={disabled}
                  onChange={(e) => {
                    lastLookupDigitsRef.current = "";
                    setForm({ ...form, cnpj: e.target.value });
                  }}
                  onBlur={(e) => editMode && void lookupCnpj(e.target.value)}
                />
                {editMode ?
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void lookupCnpj(form.cnpj)}
                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 disabled:opacity-50 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100"
                  >
                    {cnpjBusy ? "Consultando…" : "Buscar na Receita"}
                  </button>
                : null}
              </div>
            </Field>

            <Field
              label="Razão social"
              hint="Preenchida automaticamente ao buscar o CNPJ na Receita."
            >
              <input
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={form.razaoSocial}
                disabled={disabled}
                onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
              />
            </Field>

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

            <div className="grid grid-cols-2 gap-2">
              <Field label="Placa de carro">{boolSelect(form.placaCarro, (v) => setForm({ ...form!, placaCarro: v }), disabled)}</Field>
              <Field label="Aviso locução">{boolSelect(form.controlarPlaylist, (v) => setForm({ ...form!, controlarPlaylist: v }), disabled)}</Field>
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
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              <strong>Placa de carro</strong> libera o aviso de veículo no Player.{" "}
              <strong>Aviso locução</strong> libera a vinheta por texto (TTS) em Avisos. Avisos
              operacionais vêm do Suporte.
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
              Contato cobrança {form.cobrancaFromCa ? "(Conta Azul — CCF + outros contatos)" : ""}
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
                disabled={busy || cnpjBusy}
                className="w-full rounded-md bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                onClick={() => void save()}
              >
                {busy ? "Salvando…" : "Salvar cadastro PDV"}
              </button>
            : null}
            {editMode ?
              <button
                type="button"
                disabled={busy || cnpjBusy}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white dark:border-slate-600"
                onClick={() => rioPdvKey && void load(rioPdvKey, true, true)}
              >
                Atualizar contatos da Conta Azul
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
