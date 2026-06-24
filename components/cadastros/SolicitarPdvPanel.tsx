"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { prospectToPedidoPrefill } from "@/lib/cadastros/prospectService";
import type { PedidoPdvView, ProspectView } from "@/lib/cadastros/prospectTypes";
import { onlyDigits } from "@/lib/format";
import { formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950";

type RioClienteOption = { id: string; nome: string; razaoSocial: string; documento: string | null };
type RioPdvOption = { id: string; nome: string; documento: string | null };

function parsePedido(data: unknown): PedidoPdvView | null {
  if (!data || typeof data !== "object" || !("pedido" in data)) return null;
  return (data as { pedido?: PedidoPdvView }).pedido ?? null;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
  required,
  maxLength,
  onBlur,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  required?: boolean;
  maxLength?: number;
  onBlur?: () => void;
  hint?: string;
}) {
  return (
    <label className={"block text-xs font-semibold text-slate-600 dark:text-slate-400 " + (className ?? "")}>
      {label}
      {required ? " *" : ""}
      <input
        className={inputClass}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
      />
      {hint ?
        <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>
      : null}
    </label>
  );
}

const SYNC_ERROR_LABELS: Record<string, string> = {
  cliente_obrigatorio: "Selecione o cliente na Planilha Rio.",
  pdv_obrigatorio: "Selecione o PDV do cliente.",
  nome_obrigatorio: "Informe o nome fantasia da loja.",
  cnpj_obrigatorio: "Informe o CNPJ do PDV.",
  cep_obrigatorio: "Informe o CEP.",
  endereco_obrigatorio: "Informe o endereço.",
  bairro_obrigatorio: "Informe o bairro.",
  cidade_obrigatorio: "Informe a cidade.",
  uf_obrigatorio: "Informe a UF.",
  contato_loja_obrigatorio: "Informe o nome do contato da loja.",
  whatsapp_loja_obrigatorio: "Informe o WhatsApp da loja.",
  email_loja_obrigatorio: "Informe o e-mail da loja.",
  pdv_rio_invalido: "PDV não pertence ao cliente selecionado.",
};

export function SolicitarPdvPanel({ pedidoId, prospectId }: { pedidoId?: string; prospectId?: string }) {
  const [pedido, setPedido] = useState<PedidoPdvView | null>(null);
  const [vigenteYm, setVigenteYm] = useState<number | null>(null);
  const [isFinance, setIsFinance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [clientes, setClientes] = useState<RioClienteOption[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [rioLinhaId, setRioLinhaId] = useState("");
  const [pdvs, setPdvs] = useState<RioPdvOption[]>([]);
  const [rioPdvId, setRioPdvId] = useState("");
  const [cnpjBusy, setCnpjBusy] = useState(false);

  const [nomeFantasia, setNomeFantasia] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [documento, setDocumento] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [contatoLojaNome, setContatoLojaNome] = useState("");
  const [contatoLojaWhatsapp, setContatoLojaWhatsapp] = useState("");
  const [contatoLojaEmail, setContatoLojaEmail] = useState("");
  const [contatoCobrancaNome, setContatoCobrancaNome] = useState("");
  const [contatoCobrancaEmail, setContatoCobrancaEmail] = useState("");
  const [contatoCobrancaTel, setContatoCobrancaTel] = useState("");
  const [linkedProspectId, setLinkedProspectId] = useState<string | null>(prospectId ?? null);

  const applyPedido = useCallback((p: PedidoPdvView) => {
    setPedido(p);
    setNomeFantasia(p.nomeFantasia);
    setClienteNome(p.clienteNome);
    setRioLinhaId(p.rioLinhaId ?? "");
    setRioPdvId(p.rioPdvId ?? "");
    setRazaoSocial(p.razaoSocial);
    setDocumento(p.documento ?? "");
    setCep(p.cep);
    setEndereco(p.endereco);
    setNumero(p.numero);
    setComplemento(p.complemento);
    setBairro(p.bairro);
    setCidade(p.cidade);
    setUf(p.uf);
    setContatoLojaNome(p.contatoLojaNome);
    setContatoLojaWhatsapp(p.contatoLojaWhatsapp);
    setContatoLojaEmail(p.contatoLojaEmail);
    setContatoCobrancaNome(p.contatoCobrancaNome);
    setContatoCobrancaEmail(p.contatoCobrancaEmail);
    setContatoCobrancaTel(p.contatoCobrancaTel);
    setLinkedProspectId(p.prospectId);
  }, []);

  const applyPrefill = useCallback(
    (prefill: {
      clienteNome: string;
      nomeFantasia: string;
      razaoSocial: string;
      documento: string | null;
      cep: string;
      endereco: string;
      numero: string;
      complemento: string;
      bairro: string;
      cidade: string;
      uf: string;
      contatoLojaNome: string;
      contatoLojaWhatsapp: string;
      contatoLojaEmail: string;
      contatoCobrancaNome: string;
      contatoCobrancaEmail: string;
      contatoCobrancaTel: string;
      fromProducao?: boolean;
    }) => {
      setClienteNome(prefill.clienteNome);
      setNomeFantasia(prefill.nomeFantasia);
      setRazaoSocial(prefill.razaoSocial);
      setDocumento(prefill.documento ?? "");
      setCep(prefill.cep);
      setEndereco(prefill.endereco);
      setNumero(prefill.numero);
      setComplemento(prefill.complemento);
      setBairro(prefill.bairro);
      setCidade(prefill.cidade);
      setUf(prefill.uf);
      setContatoLojaNome(prefill.contatoLojaNome);
      setContatoLojaWhatsapp(prefill.contatoLojaWhatsapp);
      setContatoLojaEmail(prefill.contatoLojaEmail);
      setContatoCobrancaNome(prefill.contatoCobrancaNome);
      setContatoCobrancaEmail(prefill.contatoCobrancaEmail);
      setContatoCobrancaTel(prefill.contatoCobrancaTel);
      if (prefill.fromProducao) {
        setMsg("Cadastro importado da produção e Conta Azul (cobrança).");
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        const me = meRes.ok ? await meRes.json() : null;
        if (!cancelled && me) {
          const roles: string[] = Array.isArray(me.roles) ? me.roles : [];
          setIsFinance(roles.includes("cobranca") || roles.includes("master"));
        }

        const opcoesRes = await fetch("/api/cadastros/pedidos-cliente/rio-opcoes", {
          credentials: "same-origin",
        });
        const opcoesData = opcoesRes.ok ? await opcoesRes.json() : null;
        if (!cancelled && opcoesData) {
          setVigenteYm((opcoesData as { yearMonth?: number }).yearMonth ?? null);
          setClientes((opcoesData as { clientes?: RioClienteOption[] }).clientes ?? []);
        }

        if (pedidoId) {
          const pRes = await fetch(`/api/cadastros/pedidos-cliente/${pedidoId}`, {
            credentials: "same-origin",
          });
          const loaded = parsePedido(pRes.ok ? await pRes.json() : null);
          if (!cancelled && loaded) {
            applyPedido(loaded);
            if (loaded.rioLinhaId) {
              const pdvRes = await fetch(
                `/api/cadastros/pedidos-cliente/rio-opcoes?linhaId=${encodeURIComponent(loaded.rioLinhaId)}`,
                { credentials: "same-origin" },
              );
              const pdvData = pdvRes.ok ? await pdvRes.json() : null;
              if (!cancelled) setPdvs((pdvData as { pdvs?: RioPdvOption[] }).pdvs ?? []);
            }
          }
        } else if (prospectId) {
          const prRes = await fetch("/api/cadastros/prospects", { credentials: "same-origin" });
          const prData = prRes.ok ? await prRes.json() : null;
          const list = (prData as { prospects?: ProspectView[] })?.prospects ?? [];
          const pr = list.find((x) => x.id === prospectId);
          if (!cancelled && pr) {
            const pre = prospectToPedidoPrefill(pr);
            setNomeFantasia(pre.nomeFantasia);
            setClienteNome(pre.clienteNome);
            setRazaoSocial(pre.razaoSocial);
            setCidade(pre.cidade);
            setUf(pre.uf);
            setContatoLojaNome(pre.contatoLojaNome);
            setContatoLojaWhatsapp(pre.contatoLojaWhatsapp);
            setContatoLojaEmail(pre.contatoLojaEmail);
            setLinkedProspectId(pre.prospectId);
          }
        }
      } catch {
        if (!cancelled) setMsg("Erro ao carregar formulário.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [pedidoId, prospectId, applyPedido]);

  useEffect(() => {
    if (!rioLinhaId) {
      setPdvs([]);
      setRioPdvId("");
      return;
    }
    let cancelled = false;
    async function loadPdvs() {
      const res = await fetch(
        `/api/cadastros/pedidos-cliente/rio-opcoes?linhaId=${encodeURIComponent(rioLinhaId)}`,
        { credentials: "same-origin" },
      );
      const data = res.ok ? await res.json() : null;
      if (!cancelled) setPdvs((data as { pdvs?: RioPdvOption[] }).pdvs ?? []);
    }
    void loadPdvs();
    return () => {
      cancelled = true;
    };
  }, [rioLinhaId]);

  const filteredClientes = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes.slice(0, 40);
    return clientes
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(q) ||
          c.razaoSocial.toLowerCase().includes(q) ||
          (c.documento ?? "").includes(q),
      )
      .slice(0, 40);
  }, [clientes, clienteQuery]);

  const payload = useMemo(
    () => ({
      nomeFantasia,
      clienteNome,
      rioLinhaId: rioLinhaId || null,
      rioPdvId: rioPdvId || null,
      razaoSocial,
      documento,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      contatoLojaNome,
      contatoLojaWhatsapp,
      contatoLojaEmail,
      contatoCobrancaNome,
      contatoCobrancaEmail,
      contatoCobrancaTel,
      prospectId: linkedProspectId,
    }),
    [
      nomeFantasia,
      clienteNome,
      rioLinhaId,
      rioPdvId,
      razaoSocial,
      documento,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      contatoLojaNome,
      contatoLojaWhatsapp,
      contatoLojaEmail,
      contatoCobrancaNome,
      contatoCobrancaEmail,
      contatoCobrancaTel,
      linkedProspectId,
    ],
  );

  async function onSelectCliente(cliente: RioClienteOption) {
    setRioLinhaId(cliente.id);
    setClienteNome(cliente.nome);
    setClienteQuery(cliente.nome);
    setRioPdvId("");
    setMsg(null);
  }

  async function onSelectPdv(pdvId: string) {
    setRioPdvId(pdvId);
    if (!rioLinhaId || !pdvId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/cadastros/pedidos-cliente/prefill?rioLinhaId=${encodeURIComponent(rioLinhaId)}&rioPdvId=${encodeURIComponent(pdvId)}`,
        { credentials: "same-origin" },
      );
      const data = res.ok ? await res.json() : null;
      const prefill = (data as { prefill?: Parameters<typeof applyPrefill>[0] })?.prefill;
      if (prefill) applyPrefill(prefill);
    } catch {
      setMsg("Não foi possível carregar o cadastro do PDV.");
    } finally {
      setBusy(false);
    }
  }

  async function lookupCnpj() {
    const digits = onlyDigits(documento);
    if (digits.length !== 14) return;
    setCnpjBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cadastros/cnpj-lookup?cnpj=${encodeURIComponent(digits)}`, {
        credentials: "same-origin",
      });
      const data = res.ok ? await res.json() : null;
      const row = (data as { data?: Record<string, string> })?.data;
      if (!row) {
        setMsg("CNPJ não encontrado na Receita.");
        return;
      }
      if (row.cnpj) setDocumento(row.cnpj);
      if (row.razaoSocial) setRazaoSocial(row.razaoSocial);
      if (row.nomeFantasia && !nomeFantasia.trim()) setNomeFantasia(row.nomeFantasia);
      if (row.cep) setCep(row.cep);
      if (row.endereco) setEndereco(row.endereco);
      if (row.numero) setNumero(row.numero);
      if (row.complemento) setComplemento(row.complemento);
      if (row.bairro) setBairro(row.bairro);
      if (row.cidade) setCidade(row.cidade);
      if (row.uf) setUf(row.uf);
      setMsg("Endereço preenchido pela Receita Federal.");
    } catch {
      setMsg("Erro ao consultar CNPJ.");
    } finally {
      setCnpjBusy(false);
    }
  }

  async function saveDraft() {
    if (!rioLinhaId || !rioPdvId) {
      setMsg("Selecione cliente e PDV na Planilha Rio.");
      return;
    }
    if (!nomeFantasia.trim()) {
      setMsg("Informe o nome fantasia da loja.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const url = pedido ? `/api/cadastros/pedidos-cliente/${pedido.id}` : "/api/cadastros/pedidos-cliente";
      const res = await fetch(url, {
        method: pedido ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const saved = parsePedido(res.ok ? await res.json() : null);
      if (!saved) {
        setMsg("Não foi possível salvar.");
        return;
      }
      applyPedido(saved);
      setMsg("Rascunho salvo.");
      if (!pedidoId) {
        window.history.replaceState(null, "", `/cadastros/solicitar-pdv?id=${saved.id}`);
      }
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function atualizarCadastro() {
    if (!rioLinhaId || !rioPdvId) {
      setMsg("Selecione cliente e PDV na Planilha Rio.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const saveUrl = pedido ? `/api/cadastros/pedidos-cliente/${pedido.id}` : "/api/cadastros/pedidos-cliente";
      const saveRes = await fetch(saveUrl, {
        method: pedido ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const saved = parsePedido(saveRes.ok ? await saveRes.json() : null);
      if (!saved) {
        setMsg("Não foi possível salvar antes de atualizar.");
        return;
      }
      applyPedido(saved);

      const res = await fetch(`/api/cadastros/pedidos-cliente/${saved.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "atualizar_producao", pedido: payload }),
      });
      const data = res.ok ? await res.json() : null;
      const updated = parsePedido(data);
      if (updated) {
        applyPedido(updated);
        setMsg("Cadastro atualizado na produção.");
        window.history.replaceState(null, "", `/cadastros/solicitar-pdv?id=${updated.id}`);
      } else {
        const err = (data as { error?: string })?.error ?? "sync_failed";
        setMsg(SYNC_ERROR_LABELS[err] ?? "Falha ao atualizar cadastro na produção.");
      }
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function importarRio() {
    if (!pedido?.id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cadastros/pedidos-cliente/${pedido.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "importar_rio" }),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        const err = (data as { error?: string })?.error;
        if (err === "cliente_rio_nao_encontrado") {
          setMsg("Cliente não encontrado na Planilha Rio. Cadastre o cliente lá primeiro.");
        } else {
          setMsg("Não foi possível importar o PDV.");
        }
        return;
      }
      const saved = parsePedido(data);
      if (saved) {
        applyPedido(saved);
        setMsg("PDV importado na Planilha Rio.");
      }
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = {
    rascunho: "Rascunho",
    enviado: "Enviado (legado)",
    em_analise: "Cadastro atualizado",
    importado: "PDV importado (legado)",
    cancelado: "Cancelado",
  }[pedido?.status ?? "rascunho"];

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">Cadastrar PDV</p>
            <p className="text-xs text-teal-800/80 dark:text-teal-200/70">
              O financeiro cria os PDVs na Planilha Rio
              {vigenteYm ? ` (${formatYearMonthLabel(vigenteYm)})` : ""}. Aqui você completa o cadastro
              operacional e envia para a produção.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-900">
            {statusLabel}
          </span>
        </div>
      </div>

      {msg ?
        <p className="text-sm text-slate-700 dark:text-slate-300">{msg}</p>
      : null}

      <Section title="Cliente e PDV">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Cliente (Planilha Rio) *
            <input
              className={inputClass}
              value={clienteQuery}
              placeholder="Buscar por nome ou CNPJ…"
              onChange={(e) => setClienteQuery(e.target.value)}
            />
          </label>
          {clienteQuery.trim() && !rioLinhaId ?
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-950">
              {filteredClientes.length === 0 ?
                <li className="px-3 py-2 text-slate-500">Nenhum cliente encontrado.</li>
              : filteredClientes.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-teal-50 dark:hover:bg-teal-950/40"
                      onClick={() => void onSelectCliente(c)}
                    >
                      <span className="font-semibold">{c.nome}</span>
                      {c.razaoSocial && c.razaoSocial !== c.nome ?
                        <span className="ml-2 text-slate-500">{c.razaoSocial}</span>
                      : null}
                    </button>
                  </li>
                ))
              }
            </ul>
          : null}
          {rioLinhaId ?
            <p className="mt-1 text-xs text-teal-800 dark:text-teal-200">
              Selecionado: <strong>{clienteNome}</strong>
            </p>
          : null}
        </div>

        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 sm:col-span-2">
          PDV *
          <select
            className={inputClass}
            value={rioPdvId}
            disabled={!rioLinhaId || busy}
            onChange={(e) => void onSelectPdv(e.target.value)}
          >
            <option value="">{rioLinhaId ? "Selecione o PDV…" : "Selecione o cliente primeiro"}</option>
            {pdvs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.documento ? ` — ${p.documento}` : ""}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Dados do PDV">
        <Field label="Nome fantasia loja" value={nomeFantasia} onChange={setNomeFantasia} required />
        <Field label="Razão social" value={razaoSocial} onChange={setRazaoSocial} required />
        <Field
          label="CNPJ"
          value={documento}
          onChange={setDocumento}
          onBlur={() => void lookupCnpj()}
          required
          hint={cnpjBusy ? "Consultando Receita…" : "Ao sair do campo, busca endereço na Receita (14 dígitos)."}
        />
        <Field label="CEP" value={cep} onChange={setCep} required />
        <Field label="Endereço" value={endereco} onChange={setEndereco} className="sm:col-span-2" required />
        <Field label="Número" value={numero} onChange={setNumero} />
        <Field label="Complemento" value={complemento} onChange={setComplemento} />
        <Field label="Bairro" value={bairro} onChange={setBairro} required />
        <Field label="Cidade" value={cidade} onChange={setCidade} required />
        <Field label="UF" value={uf} onChange={setUf} maxLength={2} required />
      </Section>

      <Section title="Contato loja">
        <Field label="Nome contato loja" value={contatoLojaNome} onChange={setContatoLojaNome} required />
        <Field label="WhatsApp loja" value={contatoLojaWhatsapp} onChange={setContatoLojaWhatsapp} required />
        <Field
          label="E-mail loja"
          value={contatoLojaEmail}
          onChange={setContatoLojaEmail}
          className="sm:col-span-2"
          required
        />
      </Section>

      <Section title="Contato cobrança">
        <p className="sm:col-span-2 text-xs text-slate-500">
          Preenchido automaticamente do Conta Azul quando disponível. Campos opcionais nesta atualização.
        </p>
        <Field label="Nome responsável cobrança" value={contatoCobrancaNome} onChange={setContatoCobrancaNome} />
        <Field label="E-mail responsável cobrança" value={contatoCobrancaEmail} onChange={setContatoCobrancaEmail} />
        <Field label="Telefone responsável cobrança" value={contatoCobrancaTel} onChange={setContatoCobrancaTel} />
      </Section>

      <div className="flex flex-wrap gap-2 pb-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveDraft()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold dark:border-slate-600 dark:bg-slate-900"
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={busy || !rioLinhaId || !rioPdvId}
          onClick={() => void atualizarCadastro()}
          className="rounded-full bg-fuchsia-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Atualizar cadastro
        </button>
        {isFinance && pedido?.status !== "importado" && pedido?.id ?
          <button
            type="button"
            disabled={busy}
            onClick={() => void importarRio()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Importar PDV na Rio (legado)
          </button>
        : null}
        {rioLinhaId && vigenteYm ?
          <Link
            href={`/financeiro/planilha-rio?ym=${vigenteYm}`}
            className="rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900"
          >
            Abrir Planilha Rio →
          </Link>
        : null}
      </div>
    </div>
  );
}

/** @deprecated use SolicitarPdvPanel */
export const PedidoClientePdvPanel = SolicitarPdvPanel;
