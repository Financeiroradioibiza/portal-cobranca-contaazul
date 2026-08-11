"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyTextButton } from "@/components/CopyTextButton";
import {
  SITE_CLIENTE_PERMISSAO_LABELS,
  SITE_CLIENTE_PERMISSOES_DEFAULT,
  type SiteClientePermissoes,
} from "@/lib/site-cliente/permissions";

type GrupoListItem = {
  id: string;
  nome: string;
  active: boolean;
  usuarioCount: number;
  clienteCount: number;
  pdvCount: number;
};

type CatalogCliente = {
  key: string;
  nome: string;
  rioLinhaId: string;
  portalClienteId: number | null;
  pdvs: Array<{ rioPdvKey: string; nome: string; portalPdvId: number | null }>;
};

type Usuario = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  funcao: string;
  loginEmail: string;
  active: boolean;
  permissoes: SiteClientePermissoes;
};

type GrupoDetail = {
  id: string;
  nome: string;
  active: boolean;
  usuarios: Usuario[];
  clientes: Array<{ rioLinhaId: string; portalClienteId: number | null; nome: string }>;
  pdvs: Array<{ rioPdvKey: string; portalPdvId: number | null; nome: string; clienteNome: string }>;
  moodboards: Array<{
    rioLinhaId: string;
    perfilPublico: string;
    posicionamentoMarca: string;
    estiloMusicalPrincipal: string;
    objetivoPeriodo: string;
    notasInternas: string;
  }>;
};

const PERM_KEYS = Object.keys(SITE_CLIENTE_PERMISSOES_DEFAULT) as (keyof SiteClientePermissoes)[];

/** Escopo grava `c.key` do bucket em `rioLinhaId` (legado: alguns registros usam rioLinhaId Rio). */
function clienteEscopoCoincide(storedId: string, c: CatalogCliente): boolean {
  return storedId === c.key || (!!c.rioLinhaId && storedId === c.rioLinhaId);
}

function clienteJaNoGrupo(
  clientes: GrupoDetail["clientes"],
  c: CatalogCliente,
): boolean {
  return clientes.some((x) => clienteEscopoCoincide(x.rioLinhaId, c));
}

export function SiteClientesAdminPanel() {
  const [grupos, setGrupos] = useState<GrupoListItem[]>([]);
  const [buscaResultados, setBuscaResultados] = useState<CatalogCliente[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GrupoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState("");
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");

  const [usuarioForm, setUsuarioForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    funcao: "",
    loginEmail: "",
    password: "",
    permissoes: { ...SITE_CLIENTE_PERMISSOES_DEFAULT },
  });

  const [moodClienteId, setMoodClienteId] = useState<string | null>(null);
  const [moodClienteNome, setMoodClienteNome] = useState("");
  const [moodPortalClienteId, setMoodPortalClienteId] = useState<number | null>(null);
  const [moodForm, setMoodForm] = useState({
    perfilPublico: "",
    posicionamentoMarca: "",
    estiloMusicalPrincipal: "",
    objetivoPeriodo: "",
    notasInternas: "",
  });
  const [moodLogoPreview, setMoodLogoPreview] = useState<string | null>(null);

  const loadGrupos = useCallback(async () => {
    const res = await fetch("/api/suporte/site-clientes");
    const data = (await res.json()) as { ok?: boolean; grupos?: GrupoListItem[] };
    if (data.ok) setGrupos(data.grupos ?? []);
  }, []);

  const buscarClientes = useCallback(async (termo?: string) => {
    const q = (termo ?? buscaCliente).trim();
    if (q.length < 2) {
      setBuscaResultados([]);
      setMsg("Digite pelo menos 2 letras para buscar.");
      return;
    }
    setBuscando(true);
    setMsg("");
    try {
      const res = await fetch(`/api/suporte/site-clientes/catalog?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { ok?: boolean; clientes?: CatalogCliente[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setBuscaResultados(data.clientes ?? []);
      if ((data.clientes ?? []).length === 0) setMsg("Nenhum cliente encontrado.");
    } catch (e) {
      setBuscaResultados([]);
      setMsg(e instanceof Error ? e.message : "Falha na busca.");
    } finally {
      setBuscando(false);
    }
  }, [buscaCliente]);

  const loadDetail = useCallback(async (grupoId: string) => {
    const res = await fetch(`/api/suporte/site-clientes/${grupoId}`);
    const data = (await res.json()) as { ok?: boolean; grupo?: GrupoDetail };
    if (data.ok && data.grupo) setDetail(data.grupo);
  }, []);

  const selectGrupo = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setBuscaResultados([]);
      setBuscaCliente("");
      if (!id) {
        setDetail(null);
        return;
      }
      void loadDetail(id);
    },
    [loadDetail],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadGrupos();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadGrupos]);

  const selectedPdvs = useMemo(
    () => new Set(detail?.pdvs.map((p) => p.rioPdvKey) ?? []),
    [detail],
  );

  async function limparEscopo() {
    if (!detail) return;
    if (!window.confirm(`Remover todos os clientes e PDVs do grupo «${detail.nome}»?`)) return;
    await saveEscopo([], []);
  }

  async function removeClienteSelecionado(rioLinhaId: string) {
    if (!detail) return;
    await saveEscopo(
      detail.clientes.filter((c) => c.rioLinhaId !== rioLinhaId),
      detail.pdvs,
    );
  }

  async function removePdvSelecionado(rioPdvKey: string) {
    if (!detail) return;
    await saveEscopo(
      detail.clientes,
      detail.pdvs.filter((p) => p.rioPdvKey !== rioPdvKey),
    );
  }

  async function criarGrupo() {
    const nome = novoGrupoNome.trim();
    if (!nome) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/suporte/site-clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setNovoGrupoNome("");
      await loadGrupos();
      if (data.id) selectGrupo(data.id);
      setMsg("Grupo criado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao criar grupo.");
    } finally {
      setBusy(false);
    }
  }

  async function addCliente(c: CatalogCliente) {
    if (!detail || clienteJaNoGrupo(detail.clientes, c)) return;
    const clientes = [...detail.clientes];
    let pdvs = [...detail.pdvs];
    const pdvKeysCliente = new Set(c.pdvs.map((p) => p.rioPdvKey));
    clientes.push({
      rioLinhaId: c.key,
      portalClienteId: c.portalClienteId,
      nome: c.nome,
    });
    pdvs = pdvs.filter((p) => !pdvKeysCliente.has(p.rioPdvKey));
    await saveEscopo(clientes, pdvs);
  }

  async function togglePdv(
    pdv: CatalogCliente["pdvs"][0],
    cliente: CatalogCliente,
  ) {
    if (!detail) return;
    if (clienteJaNoGrupo(detail.clientes, cliente)) return;
    const pdvs = [...detail.pdvs];
    const idx = pdvs.findIndex((x) => x.rioPdvKey === pdv.rioPdvKey);
    if (idx >= 0) pdvs.splice(idx, 1);
    else
      pdvs.push({
        rioPdvKey: pdv.rioPdvKey,
        portalPdvId: pdv.portalPdvId,
        nome: pdv.nome,
        clienteNome: cliente.nome,
      });
    await saveEscopo(detail.clientes, pdvs);
  }

  async function saveEscopo(
    clientes: GrupoDetail["clientes"],
    pdvs: GrupoDetail["pdvs"],
  ) {
    if (!detail) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/suporte/site-clientes/${detail.id}/escopo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientes: clientes.map((c) => ({
            rioLinhaId: c.rioLinhaId,
            portalClienteId: c.portalClienteId,
          })),
          pdvs: pdvs.map((p) => ({
            rioPdvKey: p.rioPdvKey,
            portalPdvId: p.portalPdvId,
          })),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      await loadDetail(detail.id);
      await loadGrupos();
      setMsg("Escopo atualizado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar escopo.");
    } finally {
      setBusy(false);
    }
  }

  async function criarUsuario() {
    if (!detail) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/suporte/site-clientes/${detail.id}/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usuarioForm),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setUsuarioForm({
        nome: "",
        telefone: "",
        email: "",
        funcao: "",
        loginEmail: "",
        password: "",
        permissoes: { ...SITE_CLIENTE_PERMISSOES_DEFAULT },
      });
      await loadDetail(detail.id);
      await loadGrupos();
      setMsg("Usuário criado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao criar usuário.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarLogoCliente(rioLinhaId: string, portalClienteId: number | null, dataUrl: string) {
    if (!detail) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `/api/suporte/site-clientes/${detail.id}/logo/${encodeURIComponent(rioLinhaId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, portalClienteId }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setMoodLogoPreview(dataUrl);
      setMsg("Logo do cliente salvo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar logo.");
    } finally {
      setBusy(false);
    }
  }

  async function removerLogoCliente(rioLinhaId: string, portalClienteId: number | null) {
    if (!detail) return;
    setBusy(true);
    setMsg("");
    try {
      const q = portalClienteId ? `?portalClienteId=${portalClienteId}` : "";
      const res = await fetch(
        `/api/suporte/site-clientes/${detail.id}/logo/${encodeURIComponent(rioLinhaId)}${q}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      setMoodLogoPreview(null);
      setMsg("Logo removido.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao remover logo.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarMoodboard(rioLinhaId: string, portalClienteId: number | null) {
    if (!detail) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        `/api/suporte/site-clientes/${detail.id}/moodboard/${encodeURIComponent(rioLinhaId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...moodForm, portalClienteId }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "erro");
      await loadDetail(detail.id);
      setMoodClienteId(null);
      setMsg("Moodboard salvo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar moodboard.");
    } finally {
      setBusy(false);
    }
  }

  function openMoodboardCliente(c: {
    rioLinhaId: string;
    portalClienteId: number | null;
    nome: string;
  }) {
    const existing = detail?.moodboards.find((m) => m.rioLinhaId === c.rioLinhaId);
    setMoodForm({
      perfilPublico: existing?.perfilPublico ?? "",
      posicionamentoMarca: existing?.posicionamentoMarca ?? "",
      estiloMusicalPrincipal: existing?.estiloMusicalPrincipal ?? "",
      objetivoPeriodo: existing?.objetivoPeriodo ?? "",
      notasInternas: existing?.notasInternas ?? "",
    });
    setMoodClienteId(c.rioLinhaId);
    setMoodClienteNome(c.nome);
    setMoodPortalClienteId(c.portalClienteId);
    setMoodLogoPreview(null);
    if (detail) {
      const q = c.portalClienteId ? `?portalClienteId=${c.portalClienteId}` : "";
      void fetch(
        `/api/suporte/site-clientes/${detail.id}/logo/${encodeURIComponent(c.rioLinhaId)}${q}`,
      )
        .then((r) => r.json())
        .then((data: { ok?: boolean; jpegBase64?: string | null }) => {
          if (data.ok && data.jpegBase64) {
            setMoodLogoPreview(`data:image/jpeg;base64,${data.jpegBase64}`);
          }
        })
        .catch(() => null);
    }
  }

  const loginUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/site-cliente/login`
      : "/site-cliente/login";

  const grupoPronto =
    detail != null && detail.clientes.length + detail.pdvs.length > 0 && detail.usuarios.length > 0;

  return (
    <div className="space-y-6">
      {msg ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Grupos de acesso
          </h2>
          {loading ? (
            <p className="text-sm text-zinc-500">Carregando…</p>
          ) : (
            <ul className="space-y-1">
              {grupos.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => selectGrupo(g.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      selectedId === g.id
                        ? "bg-violet-100 font-medium text-violet-900 dark:bg-violet-900/40 dark:text-violet-100"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div>{g.nome}</div>
                    <div className="text-xs text-zinc-500">
                      {g.usuarioCount} usuário(s) · {g.clienteCount} cliente(s)
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <input
              className="portal-input flex-1 text-sm"
              placeholder="Ex.: Grupo Soma"
              value={novoGrupoNome}
              onChange={(e) => setNovoGrupoNome(e.target.value)}
            />
            <button
              type="button"
              className="portal-btn portal-btn-primary text-sm"
              disabled={busy}
              onClick={() => void criarGrupo()}
            >
              +
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            O cliente acessa em <strong>/site-cliente/login</strong> (celular/tablet abre em{" "}
            <strong>/m/site-cliente/login</strong>) — não precisa «criar site»; basta
            grupo + usuário.
          </p>
        </section>

        <section className="space-y-6">
          {!detail ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-600">
              Selecione ou crie um grupo para configurar usuários, clientes e moodboard.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-zinc-200 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-amber-500/10 p-5 dark:border-zinc-700">
                <h2 className="text-xl font-bold">{detail.nome}</h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {detail.usuarios.length} usuário(s) · {detail.clientes.length} cliente(s) ·{" "}
                  {detail.pdvs.length} PDV(s) avulsos
                </p>
              </div>

              {grupoPronto ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">
                    Site pronto para usar
                  </h3>
                  <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
                    Não há passo extra de «publicar site». Envie ao cliente o link e o login abaixo.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="rounded bg-white/80 px-2 py-1 text-sm dark:bg-black/30">
                      {loginUrl}
                    </code>
                    <CopyTextButton text={loginUrl} label="Copiar link" />
                    <a
                      href="/site-cliente/login"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-btn portal-btn-primary text-sm"
                    >
                      Abrir login
                    </a>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-emerald-900 dark:text-emerald-100">
                    {detail.usuarios.map((u) => (
                      <li key={u.id}>
                        <strong>{u.nome}</strong> — login:{" "}
                        <code className="rounded bg-white/60 px-1 dark:bg-black/20">{u.loginEmail}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                    A senha é a que você definiu ao criar o usuário (não fica salva em texto aqui).
                  </p>
                </div>
              ) : null}

              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Clientes no grupo</h3>
                  {detail.clientes.length + detail.pdvs.length > 0 ? (
                    <button
                      type="button"
                      className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                      disabled={busy}
                      onClick={() => void limparEscopo()}
                    >
                      Remover todos
                    </button>
                  ) : null}
                </div>

                {detail.clientes.length === 0 && detail.pdvs.length === 0 ? (
                  <p className="mb-4 text-sm text-zinc-500">
                    Nenhum cliente selecionado. Use a busca abaixo para adicionar.
                  </p>
                ) : (
                  <ul className="mb-4 space-y-2">
                    {detail.clientes.map((c) => (
                      <li
                        key={c.rioLinhaId}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm dark:bg-violet-950/30"
                      >
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-xs text-zinc-500">(todos os PDVs)</span>
                        <button
                          type="button"
                          className="rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-2 py-0.5 text-xs font-semibold text-white"
                          onClick={() => openMoodboardCliente(c)}
                        >
                          Configurar
                        </button>
                        <button
                          type="button"
                          className="ml-auto text-xs text-rose-600 hover:underline"
                          disabled={busy}
                          onClick={() => void removeClienteSelecionado(c.rioLinhaId)}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                    {detail.pdvs.map((p) => (
                      <li
                        key={p.rioPdvKey}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60"
                      >
                        <span>
                          PDV avulso: <strong>{p.nome}</strong>
                          {p.clienteNome ? ` · ${p.clienteNome}` : ""}
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-xs text-rose-600 hover:underline"
                          disabled={busy}
                          onClick={() => void removePdvSelecionado(p.rioPdvKey)}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <h4 className="mb-1 text-sm font-medium">Adicionar cliente</h4>
                <p className="mb-2 text-xs text-zinc-500">
                  Busque pelo nome (mín. 2 letras). Marcar o cliente inclui todos os PDVs dele.
                </p>
                <div className="mb-3 flex gap-2">
                  <input
                    className="portal-input flex-1 text-sm"
                    placeholder="Ex.: Boteco Princesa"
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void buscarClientes();
                    }}
                  />
                  <button
                    type="button"
                    className="portal-btn portal-btn-primary text-sm"
                    disabled={busy || buscando}
                    onClick={() => void buscarClientes()}
                  >
                    {buscando ? "…" : "Buscar"}
                  </button>
                </div>

                {buscaResultados.length > 0 ? (
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-100 p-2 dark:border-zinc-800">
                    {buscaResultados.map((c) => {
                      const jaSelecionado = detail ? clienteJaNoGrupo(detail.clientes, c) : false;
                      return (
                        <div
                          key={c.key}
                          className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="portal-btn text-sm"
                              disabled={busy || jaSelecionado}
                              onClick={() => void addCliente(c)}
                            >
                              {jaSelecionado ? "Já no grupo" : "Adicionar cliente"}
                            </button>
                            <span className="font-medium">{c.nome}</span>
                            <span className="text-xs text-zinc-500">{c.pdvs.length} PDV(s)</span>
                          </div>
                          {!jaSelecionado && c.pdvs.length > 0 ? (
                            <div className="mt-2 space-y-1 pl-1">
                              {c.pdvs.map((p) => (
                                <div key={p.rioPdvKey} className="flex items-center gap-2 text-xs">
                                  <button
                                    type="button"
                                    className="text-violet-600 hover:underline dark:text-violet-400"
                                    disabled={busy || selectedPdvs.has(p.rioPdvKey)}
                                    onClick={() => void togglePdv(p, c)}
                                  >
                                    {selectedPdvs.has(p.rioPdvKey) ? "PDV já no grupo" : `+ PDV: ${p.nome}`}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <h3 className="mb-3 font-semibold">Usuários do grupo</h3>
                {detail.usuarios.length > 0 ? (
                  <ul className="mb-4 space-y-2">
                    {detail.usuarios.map((u) => (
                      <li
                        key={u.id}
                        className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60"
                      >
                        <strong>{u.nome}</strong> — {u.loginEmail}
                        {u.funcao ? ` · ${u.funcao}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-4 text-sm text-zinc-500">Nenhum usuário ainda.</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="portal-input text-sm"
                    placeholder="Nome"
                    value={usuarioForm.nome}
                    onChange={(e) => setUsuarioForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                  <input
                    className="portal-input text-sm"
                    placeholder="Função na empresa"
                    value={usuarioForm.funcao}
                    onChange={(e) => setUsuarioForm((f) => ({ ...f, funcao: e.target.value }))}
                  />
                  <input
                    className="portal-input text-sm"
                    placeholder="Telefone"
                    value={usuarioForm.telefone}
                    onChange={(e) => setUsuarioForm((f) => ({ ...f, telefone: e.target.value }))}
                  />
                  <input
                    className="portal-input text-sm"
                    placeholder="E-mail contato"
                    value={usuarioForm.email}
                    onChange={(e) => setUsuarioForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  <input
                    className="portal-input text-sm"
                    placeholder="Login (e-mail de acesso)"
                    value={usuarioForm.loginEmail}
                    onChange={(e) => setUsuarioForm((f) => ({ ...f, loginEmail: e.target.value }))}
                  />
                  <input
                    className="portal-input text-sm"
                    type="password"
                    placeholder="Senha inicial"
                    value={usuarioForm.password}
                    onChange={(e) => setUsuarioForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {PERM_KEYS.map((key) => (
                    <label key={key} className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={usuarioForm.permissoes[key]}
                        onChange={(e) =>
                          setUsuarioForm((f) => ({
                            ...f,
                            permissoes: { ...f.permissoes, [key]: e.target.checked },
                          }))
                        }
                      />
                      {SITE_CLIENTE_PERMISSAO_LABELS[key]}
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  className="portal-btn portal-btn-primary mt-4"
                  disabled={busy}
                  onClick={() => void criarUsuario()}
                >
                  Adicionar usuário
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {moodClienteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-cyan-500 p-1 shadow-2xl">
            <div className="rounded-[14px] bg-white p-5 dark:bg-zinc-900">
              <h3 className="text-lg font-bold">Cliente — {moodClienteNome}</h3>

              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="text-xs font-semibold uppercase text-zinc-500">Logo do cliente</p>
                <p className="mt-1 text-xs text-zinc-500">
                  JPEG até 400 KB. Aparece no site do cliente ao lado do nome, com «by Radio Ibiza».
                  {moodPortalClienteId ? " Também sincroniza com o Player 5." : ""}
                </p>
                {moodLogoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={moodLogoPreview}
                    alt="Preview logo"
                    className="mt-3 max-h-16 rounded border border-zinc-200 dark:border-zinc-600"
                  />
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="portal-btn portal-btn-primary cursor-pointer text-sm">
                    Enviar JPEG
                    <input
                      type="file"
                      accept="image/jpeg,.jpg"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !moodClienteId) return;
                        if (file.size > 400_000) {
                          setMsg("Arquivo grande demais (máx. ~400 KB).");
                          return;
                        }
                        void new Promise<string>((resolve, reject) => {
                          const r = new FileReader();
                          r.onload = () => resolve(String(r.result ?? ""));
                          r.onerror = () => reject(new Error("leitura_falhou"));
                          r.readAsDataURL(file);
                        }).then((dataUrl) =>
                          salvarLogoCliente(moodClienteId, moodPortalClienteId, dataUrl),
                        );
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {moodLogoPreview ? (
                    <button
                      type="button"
                      className="portal-btn text-sm text-rose-600"
                      disabled={busy}
                      onClick={() =>
                        moodClienteId &&
                        void removerLogoCliente(moodClienteId, moodPortalClienteId)
                      }
                    >
                      Remover logo
                    </button>
                  ) : null}
                </div>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase text-zinc-500">Moodboard</p>
              <div className="mt-2 space-y-3">
                <textarea
                  className="portal-input min-h-[80px] w-full text-sm"
                  placeholder="Perfil do público"
                  value={moodForm.perfilPublico}
                  onChange={(e) => setMoodForm((f) => ({ ...f, perfilPublico: e.target.value }))}
                />
                <textarea
                  className="portal-input min-h-[80px] w-full text-sm"
                  placeholder="Posicionamento da marca"
                  value={moodForm.posicionamentoMarca}
                  onChange={(e) =>
                    setMoodForm((f) => ({ ...f, posicionamentoMarca: e.target.value }))
                  }
                />
                <input
                  className="portal-input w-full text-sm"
                  placeholder="Estilo musical principal"
                  value={moodForm.estiloMusicalPrincipal}
                  onChange={(e) =>
                    setMoodForm((f) => ({ ...f, estiloMusicalPrincipal: e.target.value }))
                  }
                />
                <textarea
                  className="portal-input min-h-[80px] w-full text-sm"
                  placeholder="Objetivo do período"
                  value={moodForm.objetivoPeriodo}
                  onChange={(e) => setMoodForm((f) => ({ ...f, objetivoPeriodo: e.target.value }))}
                />
                <textarea
                  className="portal-input min-h-[60px] w-full text-sm"
                  placeholder="Notas internas (não visível ao cliente)"
                  value={moodForm.notasInternas}
                  onChange={(e) => setMoodForm((f) => ({ ...f, notasInternas: e.target.value }))}
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="portal-btn"
                  onClick={() => setMoodClienteId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="portal-btn portal-btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void salvarMoodboard(moodClienteId, moodPortalClienteId)
                  }
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
