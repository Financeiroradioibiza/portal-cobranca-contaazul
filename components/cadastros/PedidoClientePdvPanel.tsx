"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { prospectToPedidoPrefill } from "@/lib/cadastros/prospectService";
import { EMPTY_PDVS, type PedidoClienteView, type PedidoPdvPayload, type ProspectView } from "@/lib/cadastros/prospectTypes";
import { pickVigenteRioYearMonth } from "@/lib/cadastros/vigenteRioMonth";
import { currentBrazilYearMonth, formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

type RioGrupo = { id: string; nome: string };
type MonthMeta = { id: string; yearMonth: number };

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950";

function parsePedido(data: unknown): PedidoClienteView | null {
  if (!data || typeof data !== "object" || !("pedido" in data)) return null;
  return (data as { pedido?: PedidoClienteView }).pedido ?? null;
}

export function PedidoClientePdvPanel({ pedidoId, prospectId }: { pedidoId?: string; prospectId?: string }) {
  const [pedido, setPedido] = useState<PedidoClienteView | null>(null);
  const [grupos, setGrupos] = useState<RioGrupo[]>([]);
  const [vigenteYm, setVigenteYm] = useState<number | null>(null);
  const [isFinance, setIsFinance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [nomeFantasia, setNomeFantasia] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [documento, setDocumento] = useState("");
  const [emailCobranca, setEmailCobranca] = useState("");
  const [origemCliente, setOrigemCliente] = useState("");
  const [valorPdvUnitarioTexto, setValorPdvUnitarioTexto] = useState("");
  const [categoriaSite, setCategoriaSite] = useState("");
  const [observacoesCliente, setObservacoesCliente] = useState("");
  const [rioGrupoId, setRioGrupoId] = useState("");
  const [pdvs, setPdvs] = useState<PedidoPdvPayload[]>([{ ...EMPTY_PDVS }]);
  const [linkedProspectId, setLinkedProspectId] = useState<string | null>(prospectId ?? null);

  const applyPedido = useCallback((p: PedidoClienteView) => {
    setPedido(p);
    setNomeFantasia(p.nomeFantasia);
    setRazaoSocial(p.razaoSocial);
    setDocumento(p.documento ?? "");
    setEmailCobranca(p.emailCobranca);
    setOrigemCliente(p.origemCliente);
    setValorPdvUnitarioTexto(p.valorPdvUnitarioTexto);
    setCategoriaSite(p.categoriaSite);
    setObservacoesCliente(p.observacoesCliente);
    setRioGrupoId(p.rioGrupoId ?? "");
    setPdvs(p.pdvs.length > 0 ? p.pdvs : [{ ...EMPTY_PDVS, nome: p.nomeFantasia }]);
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
        const months: MonthMeta[] = monthsData?.months ?? [];
        const ym = pickVigenteRioYearMonth(months, currentBrazilYearMonth());
        if (!cancelled) setVigenteYm(ym);

        const monthRes = await fetch(`/api/rio-planilha/clientes/month/${ym}`);
        const monthData = monthRes.ok ? await monthRes.json() : null;
        const g: RioGrupo[] = (monthData?.grupos ?? []).map((x: { id: string; nome: string }) => ({
          id: x.id,
          nome: x.nome,
        }));
        if (!cancelled) setGrupos(g);

        if (pedidoId) {
          const pRes = await fetch(`/api/cadastros/pedidos-cliente/${pedidoId}`, { credentials: "same-origin" });
          const pData = pRes.ok ? await pRes.json() : null;
          const loaded = parsePedido(pData);
          if (!cancelled && loaded) applyPedido(loaded);
        } else if (prospectId) {
          const prRes = await fetch("/api/cadastros/prospects", { credentials: "same-origin" });
          const prData = prRes.ok ? await prRes.json() : null;
          const list = (prData as { prospects?: ProspectView[] })?.prospects ?? [];
          const pr = list.find((x) => x.id === prospectId);
          if (!cancelled && pr) {
            const pre = prospectToPedidoPrefill(pr);
            setNomeFantasia(pre.nomeFantasia);
            setRazaoSocial(pre.razaoSocial);
            setValorPdvUnitarioTexto(pre.valorPdvUnitarioTexto);
            setObservacoesCliente(pre.observacoesCliente);
            setLinkedProspectId(pre.prospectId);
            setPdvs(
              pre.pdvs.map((p) => ({
                ...EMPTY_PDVS,
                nome: p.nome,
                cidade: p.cidade,
                estado: p.estado,
              })),
            );
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

  const grupoSite = useMemo(
    () => grupos.find((g) => g.id === rioGrupoId)?.nome ?? "",
    [grupos, rioGrupoId],
  );

  const payload = useMemo(
    () => ({
      nomeFantasia,
      razaoSocial,
      documento,
      emailCobranca,
      origemCliente,
      valorPdvUnitarioTexto,
      numeroPdvSite: pdvs.filter((p) => p.nome.trim()).length || 1,
      categoriaSite,
      observacoesCliente,
      rioGrupoId: rioGrupoId || null,
      grupoSite,
      pdvs,
      prospectId: linkedProspectId,
    }),
    [
      nomeFantasia,
      razaoSocial,
      documento,
      emailCobranca,
      origemCliente,
      valorPdvUnitarioTexto,
      pdvs,
      categoriaSite,
      observacoesCliente,
      rioGrupoId,
      grupoSite,
      linkedProspectId,
    ],
  );

  async function saveDraft() {
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
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        setMsg("Não foi possível salvar.");
        return;
      }
      const saved = parsePedido(data);
      if (saved) {
        applyPedido(saved);
        setMsg("Rascunho salvo.");
        if (!pedidoId && saved.id) {
          window.history.replaceState(null, "", `/cadastros/cliente-pdv-novo?id=${saved.id}`);
        }
      }
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function enviarFinanceiro() {
    if (!nomeFantasia.trim()) {
      setMsg("Informe o nome fantasia.");
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
      const saveData = saveRes.ok ? await saveRes.json() : null;
      const saved = parsePedido(saveData);
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
      const data = res.ok ? await res.json() : null;
      const sent = parsePedido(data);
      if (sent) {
        applyPedido(sent);
        setMsg("Enviado ao financeiro — chamado aberto no setor Financeiro.");
        window.history.replaceState(null, "", `/cadastros/cliente-pdv-novo?id=${sent.id}`);
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
      const saved = parsePedido(data);
      if (saved) {
        applyPedido(saved);
        setMsg("Importado na Planilha Rio com sucesso.");
      } else {
        setMsg("Não foi possível importar.");
      }
    } catch {
      setMsg("Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  function updatePdv(index: number, field: keyof PedidoPdvPayload, value: string) {
    setPdvs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function addPdv() {
    setPdvs((prev) => [...prev, { ...EMPTY_PDVS }]);
  }

  function removePdv(index: number) {
    setPdvs((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const statusLabel = {
    rascunho: "Rascunho",
    enviado: "Enviado ao financeiro",
    em_analise: "Em análise",
    importado: "Importado na Rio",
    cancelado: "Cancelado",
  }[pedido?.status ?? "rascunho"];

  if (loading) return <p className="text-sm text-slate-500">Carregando formulário…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 dark:border-teal-900 dark:bg-teal-950/30">
        <div>
          <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
            Pedido Relacionamento → Financeiro
          </p>
          <p className="text-xs text-teal-800/80 dark:text-teal-200/70">
            Ao enviar, abre um chamado para o setor financeiro importar na Planilha Rio
            {vigenteYm ? ` (${formatYearMonthLabel(vigenteYm)})` : ""}.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
          {statusLabel}
        </span>
      </div>

      {msg ?
        <p className="text-sm text-slate-700 dark:text-slate-300">{msg}</p>
      : null}

      {pedido?.chamadoId ?
        <p className="text-sm">
          Chamado:{" "}
          <Link href="/chamados" className="font-semibold text-fuchsia-600 underline">
            abrir quadro de chamados
          </Link>
        </p>
      : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Dados do cliente</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Nome fantasia *" value={nomeFantasia} onChange={setNomeFantasia} />
          <L label="Razão social" value={razaoSocial} onChange={setRazaoSocial} />
          <L label="CNPJ" value={documento} onChange={setDocumento} />
          <L label="E-mail cobrança" value={emailCobranca} onChange={setEmailCobranca} />
          <L label="Origem (APP / OC / PERMUTA)" value={origemCliente} onChange={setOrigemCliente} />
          <L label="Valor unitário PDV" value={valorPdvUnitarioTexto} onChange={setValorPdvUnitarioTexto} />
          <L label="Categoria site" value={categoriaSite} onChange={setCategoriaSite} />
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Grupo MARCA (Planilha Rio)
            <select className={inputClass} value={rioGrupoId} onChange={(e) => setRioGrupoId(e.target.value)}>
              <option value="">— Selecionar —</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-400">
          Observações
          <textarea className={inputClass} rows={3} value={observacoesCliente} onChange={(e) => setObservacoesCliente(e.target.value)} />
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">PDVs ({pdvs.length})</h2>
          <button type="button" onClick={addPdv} className="text-xs font-semibold text-fuchsia-600">
            + Adicionar PDV
          </button>
        </div>
        {pdvs.map((pdv, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">PDV {i + 1}</span>
              {pdvs.length > 1 ?
                <button type="button" onClick={() => removePdv(i)} className="text-xs text-rose-600">
                  Remover
                </button>
              : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Nome PDV *" value={pdv.nome} onChange={(v) => updatePdv(i, "nome", v)} />
              <L label="CNPJ PDV" value={pdv.documento} onChange={(v) => updatePdv(i, "documento", v)} />
              <L label="CEP" value={pdv.cep} onChange={(v) => updatePdv(i, "cep", v)} />
              <L label="Endereço" value={pdv.endereco} onChange={(v) => updatePdv(i, "endereco", v)} />
              <L label="Número" value={pdv.numero} onChange={(v) => updatePdv(i, "numero", v)} />
              <L label="Complemento" value={pdv.complemento} onChange={(v) => updatePdv(i, "complemento", v)} />
              <L label="Bairro" value={pdv.bairro} onChange={(v) => updatePdv(i, "bairro", v)} />
              <L label="Cidade" value={pdv.cidade} onChange={(v) => updatePdv(i, "cidade", v)} />
              <L label="UF" value={pdv.estado} onChange={(v) => updatePdv(i, "estado", v)} />
              <L label="Programação musical" value={pdv.programacaoMusical} onChange={(v) => updatePdv(i, "programacaoMusical", v)} />
              <L label="Contato loja" value={pdv.contatoLojaNome} onChange={(v) => updatePdv(i, "contatoLojaNome", v)} />
              <L label="E-mail loja" value={pdv.contatoLojaEmail} onChange={(v) => updatePdv(i, "contatoLojaEmail", v)} />
              <L label="Tel. loja" value={pdv.contatoLojaTelefone} onChange={(v) => updatePdv(i, "contatoLojaTelefone", v)} />
              <L label="Contato cobrança" value={pdv.contatoCobrancaNome} onChange={(v) => updatePdv(i, "contatoCobrancaNome", v)} />
              <L label="E-mail cobrança PDV" value={pdv.contatoCobrancaEmail} onChange={(v) => updatePdv(i, "contatoCobrancaEmail", v)} />
              <L label="Tel. cobrança PDV" value={pdv.contatoCobrancaTelefone} onChange={(v) => updatePdv(i, "contatoCobrancaTelefone", v)} />
            </div>
            <label className="mt-2 block text-xs font-semibold text-slate-600">
              Observações PDV
              <textarea className={inputClass} rows={2} value={pdv.observacoes} onChange={(e) => updatePdv(i, "observacoes", e.target.value)} />
            </label>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !nomeFantasia.trim() || pedido?.status === "importado"}
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
            Importar na Planilha Rio
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

function L({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
      {label}
      <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
