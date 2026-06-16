"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { prospectToPedidoPrefill } from "@/lib/cadastros/prospectService";
import type { PedidoPdvView, ProspectView } from "@/lib/cadastros/prospectTypes";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth, formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950";

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  required?: boolean;
  maxLength?: number;
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
        required={required}
      />
    </label>
  );
}

export function SolicitarPdvPanel({ pedidoId, prospectId }: { pedidoId?: string; prospectId?: string }) {
  const [pedido, setPedido] = useState<PedidoPdvView | null>(null);
  const [vigenteYm, setVigenteYm] = useState<number | null>(null);
  const [isFinance, setIsFinance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

        const monthsRes = await fetch("/api/rio-planilha/clientes/months");
        const monthsData = monthsRes.ok ? await monthsRes.json() : null;
        const ym = pickVigenteRioYearMonth(monthsData?.months ?? [], currentBrazilYearMonth());
        if (!cancelled) setVigenteYm(ym);

        if (pedidoId) {
          const pRes = await fetch(`/api/cadastros/pedidos-cliente/${pedidoId}`, { credentials: "same-origin" });
          const loaded = parsePedido(pRes.ok ? await pRes.json() : null);
          if (!cancelled && loaded) applyPedido(loaded);
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

  const payload = useMemo(
    () => ({
      nomeFantasia,
      clienteNome,
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

  async function saveDraft() {
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

  async function enviarFinanceiro() {
    if (!nomeFantasia.trim()) {
      setMsg("Informe o nome fantasia da loja.");
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
        setMsg("Não foi possível salvar antes de enviar.");
        return;
      }
      applyPedido(saved);

      const res = await fetch(`/api/cadastros/pedidos-cliente/${saved.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "enviar" }),
      });
      const sent = parsePedido(res.ok ? await res.json() : null);
      if (sent) {
        applyPedido(sent);
        setMsg("Solicitação enviada ao financeiro via chamado.");
        window.history.replaceState(null, "", `/cadastros/solicitar-pdv?id=${sent.id}`);
      } else {
        setMsg("Falha ao enviar.");
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
    enviado: "Enviado ao financeiro",
    em_analise: "Em análise",
    importado: "PDV importado",
    cancelado: "Cancelado",
  }[pedido?.status ?? "rascunho"];

  if (loading) return <p className="text-sm text-slate-500">Carregando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">Solicitar PDV</p>
            <p className="text-xs text-teal-800/80 dark:text-teal-200/70">
              O cliente deve já existir na Planilha Rio
              {vigenteYm ? ` (${formatYearMonthLabel(vigenteYm)})` : ""}. O financeiro recebe via chamado.
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

      {pedido?.chamadoId ?
        <p className="text-sm">
          Chamado aberto —{" "}
          <Link href="/chamados" className="font-semibold text-fuchsia-600 underline">
            ver quadro
          </Link>
        </p>
      : null}

      <Section title="Dados do PDV">
        <Field label="Nome fantasia loja" value={nomeFantasia} onChange={setNomeFantasia} required />
        <Field label="Cliente" value={clienteNome} onChange={setClienteNome} required />
        <Field label="Razão social" value={razaoSocial} onChange={setRazaoSocial} />
        <Field label="CNPJ" value={documento} onChange={setDocumento} />
        <Field label="CEP" value={cep} onChange={setCep} />
        <Field label="Endereço" value={endereco} onChange={setEndereco} className="sm:col-span-2" />
        <Field label="Número" value={numero} onChange={setNumero} />
        <Field label="Complemento" value={complemento} onChange={setComplemento} />
        <Field label="Bairro" value={bairro} onChange={setBairro} />
        <Field label="Cidade" value={cidade} onChange={setCidade} />
        <Field label="UF" value={uf} onChange={setUf} maxLength={2} />
      </Section>

      <Section title="Contato loja">
        <Field label="Nome contato loja" value={contatoLojaNome} onChange={setContatoLojaNome} />
        <Field label="WhatsApp loja" value={contatoLojaWhatsapp} onChange={setContatoLojaWhatsapp} />
        <Field label="E-mail loja" value={contatoLojaEmail} onChange={setContatoLojaEmail} className="sm:col-span-2" />
      </Section>

      <Section title="Contato cobrança">
        <Field label="Nome responsável cobrança" value={contatoCobrancaNome} onChange={setContatoCobrancaNome} />
        <Field label="E-mail responsável cobrança" value={contatoCobrancaEmail} onChange={setContatoCobrancaEmail} />
        <Field label="Telefone responsável cobrança" value={contatoCobrancaTel} onChange={setContatoCobrancaTel} />
      </Section>

      <div className="flex flex-wrap gap-2 pb-4">
        <button
          type="button"
          disabled={busy || pedido?.status === "importado"}
          onClick={() => void saveDraft()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold dark:border-slate-600 dark:bg-slate-900"
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={busy || !nomeFantasia.trim() || pedido?.status === "importado"}
          onClick={() => void enviarFinanceiro()}
          className="rounded-full bg-fuchsia-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Enviar ao financeiro
        </button>
        {isFinance && pedido?.status !== "importado" && pedido?.id ?
          <button
            type="button"
            disabled={busy}
            onClick={() => void importarRio()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Importar PDV na Rio
          </button>
        : null}
        {pedido?.rioLinhaId && vigenteYm ?
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
