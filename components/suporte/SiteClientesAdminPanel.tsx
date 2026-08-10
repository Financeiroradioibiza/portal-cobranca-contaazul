"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function SiteClientesAdminPanel() {
  const [grupos, setGrupos] = useState<GrupoListItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogCliente[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GrupoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
  const [moodForm, setMoodForm] = useState({
    perfilPublico: "",
    posicionamentoMarca: "",
    estiloMusicalPrincipal: "",
    objetivoPeriodo: "",
    notasInternas: "",
  });

  const loadGrupos = useCallback(async () => {
    const res = await fetch("/api/suporte/site-clientes");
    const data = (await res.json()) as { ok?: boolean; grupos?: GrupoListItem[] };
    if (data.ok) setGrupos(data.grupos ?? []);
  }, []);

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/suporte/site-clientes/catalog");
    const data = (await res.json()) as { ok?: boolean; clientes?: CatalogCliente[] };
    if (data.ok) setCatalog(data.clientes ?? []);
  }, []);

  const loadDetail = useCallback(async (grupoId: string) => {
    const res = await fetch(`/api/suporte/site-clientes/${grupoId}`);
    const data = (await res.json()) as { ok?: boolean; grupo?: GrupoDetail };
    if (data.ok && data.grupo) setDetail(data.grupo);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await Promise.all([loadGrupos(), loadCatalog()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadGrupos, loadCatalog]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const clientesFiltrados = useMemo(() => {
    const q = buscaCliente.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.nome.toLowerCase().includes(q));
  }, [catalog, buscaCliente]);

  const selectedLinhas = useMemo(
    () => new Set(detail?.clientes.map((c) => c.rioLinhaId) ?? []),
    [detail],
  );
  const selectedPdvs = useMemo(
    () => new Set(detail?.pdvs.map((p) => p.rioPdvKey) ?? []),
    [detail],
  );

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
      if (data.id) setSelectedId(data.id);
      setMsg("Grupo criado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao criar grupo.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCliente(c: CatalogCliente) {
    if (!detail) return;
    const clientes = [...detail.clientes];
    const idx = clientes.findIndex((x) => x.rioLinhaId === c.rioLinhaId);
    if (idx >= 0) clientes.splice(idx, 1);
    else
      clientes.push({
        rioLinhaId: c.rioLinhaId,
        portalClienteId: c.portalClienteId,
        nome: c.nome,
      });
    await saveEscopo(clientes, detail.pdvs);
  }

  async function togglePdv(
    pdv: CatalogCliente["pdvs"][0],
    cliente: CatalogCliente,
  ) {
    if (!detail) return;
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

  function openMoodboard(c: CatalogCliente) {
    const existing = detail?.moodboards.find((m) => m.rioLinhaId === c.rioLinhaId);
    setMoodForm({
      perfilPublico: existing?.perfilPublico ?? "",
      posicionamentoMarca: existing?.posicionamentoMarca ?? "",
      estiloMusicalPrincipal: existing?.estiloMusicalPrincipal ?? "",
      objetivoPeriodo: existing?.objetivoPeriodo ?? "",
      notasInternas: existing?.notasInternas ?? "",
    });
    setMoodClienteId(c.rioLinhaId);
  }

  const moodCliente = catalog.find((c) => c.rioLinhaId === moodClienteId);

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
                    onClick={() => setSelectedId(g.id)}
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
            URL do cliente: <strong>/site-cliente/login</strong>
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

              <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <h3 className="mb-3 font-semibold">Escopo — clientes e PDVs</h3>
                <input
                  className="portal-input mb-3 w-full text-sm"
                  placeholder="Buscar cliente…"
                  value={buscaCliente}
                  onChange={(e) => setBuscaCliente(e.target.value)}
                />
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {clientesFiltrados.map((c) => (
                    <div
                      key={c.key}
                      className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedLinhas.has(c.rioLinhaId)}
                            onChange={() => void toggleCliente(c)}
                            disabled={busy}
                          />
                          <span className="font-medium">{c.nome}</span>
                        </label>
                        {selectedLinhas.has(c.rioLinhaId) ? (
                          <button
                            type="button"
                            className="rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white shadow"
                            onClick={() => openMoodboard(c)}
                          >
                            Moodboard
                          </button>
                        ) : null}
                      </div>
                      {c.pdvs.length > 0 ? (
                        <div className="mt-2 ml-6 space-y-1">
                          {c.pdvs.map((p) => (
                            <label
                              key={p.rioPdvKey}
                              className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400"
                            >
                              <input
                                type="checkbox"
                                checked={selectedPdvs.has(p.rioPdvKey)}
                                onChange={() => void togglePdv(p, c)}
                                disabled={busy}
                              />
                              PDV: {p.nome}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
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

      {moodClienteId && moodCliente ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-gradient-to-br from-fuchsia-600 via-violet-600 to-cyan-500 p-1 shadow-2xl">
            <div className="rounded-[14px] bg-white p-5 dark:bg-zinc-900">
              <h3 className="text-lg font-bold">Moodboard — {moodCliente.nome}</h3>
              <div className="mt-4 space-y-3">
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
                    void salvarMoodboard(moodCliente.rioLinhaId, moodCliente.portalClienteId)
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
