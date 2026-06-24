"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPortalPdvIdDisplay } from "@/lib/player/portalPlayerIds";
import { runPlayerGatewaySyncBatches } from "@/lib/player/syncGatewayClient";
import { currentBrazilYearMonth, formatYearMonthLabel } from "@/lib/manualReminders/yearMonth";

type Row = {
  rioPdvId: string;
  rioPdvNome: string;
  clienteNome: string;
  link: { portalClienteId: number; portalPdvId: number } | null;
};

function SyncBadge({ synced }: { synced: boolean }) {
  if (!synced) return null;
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white bg-emerald-600"
      title="Sincronizado no Player 5 (gateway)"
    >
      Sync
    </span>
  );
}

function IdsTable({
  rows,
  syncedPdvIds,
  showSyncBadge,
}: {
  rows: Row[];
  syncedPdvIds: Set<number>;
  showSyncBadge: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Nenhum registro.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
          <tr>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">PDV</th>
            <th className="px-3 py-2 text-center">ID cliente</th>
            <th className="px-3 py-2 text-center">ID PDV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pdvSynced =
              showSyncBadge &&
              r.link != null &&
              syncedPdvIds.has(r.link.portalPdvId);
            return (
              <tr key={r.rioPdvId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">{r.clienteNome}</td>
                <td className="px-3 py-2">{r.rioPdvNome}</td>
                <td className="px-3 py-2 text-center font-mono text-sky-700 dark:text-sky-400">
                  {r.link?.portalClienteId ?? "—"}
                </td>
                <td className="px-3 py-2 text-center font-mono text-emerald-700 dark:text-emerald-400">
                  <span className="inline-flex items-center justify-center gap-0.5">
                    {r.link ? formatPortalPdvIdDisplay(r.link.portalPdvId) : "—"}
                    {pdvSynced ? <SyncBadge synced /> : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type PilotStep = { id: string; label: string; ok: boolean; detail: string };

function ClienteLogotipoBlock({ busy, setBusy, setMsg }: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setMsg: (v: string) => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  async function loadPreview(id: number) {
    const res = await fetch(`/api/player/cliente/${id}/logotipo`);
    const data = (await res.json()) as { ok?: boolean; jpegBase64?: string | null };
    if (data.ok && data.jpegBase64) {
      setPreview(`data:image/jpeg;base64,${data.jpegBase64}`);
    } else {
      setPreview(null);
    }
  }

  async function onUpload(file: File | null) {
    const cid = Number(clienteId.trim());
    if (!Number.isFinite(cid) || cid <= 0) {
      setMsg("Informe ID cliente Player válido (ex.: 100).");
      return;
    }
    if (!file) return;
    if (file.type !== "image/jpeg" && !file.name.toLowerCase().endsWith(".jpg")) {
      setMsg("Use arquivo JPEG (.jpg).");
      return;
    }
    if (file.size > 400_000) {
      setMsg("Arquivo grande demais (máx. ~400 KB).");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("leitura_falhou"));
        r.readAsDataURL(file);
      });
      const res = await fetch(`/api/player/cliente/${cid}/logotipo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "upload_falhou");
      setPreview(dataUrl);
      setMsg(`Logotipo salvo para cliente ${cid}. Rode «Sincronizar Player 5».`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    const cid = Number(clienteId.trim());
    if (!Number.isFinite(cid) || cid <= 0) {
      setMsg("Informe ID cliente Player válido.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/player/cliente/${cid}/logotipo`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("remove_falhou");
      setPreview(null);
      setMsg(`Logotipo removido do cliente ${cid}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao remover.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <p className="text-xs font-bold uppercase text-slate-500">Logotipo do cliente (Player 5)</p>
      <p className="mt-1 text-xs text-slate-500">
        JPEG até 400 KB. Sincronize o gateway após enviar. O player carrega via{" "}
        <code className="text-[10px]">/api/logotipo_cliente/</code>.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block text-xs">
          <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">ID cliente</span>
          <input
            inputMode="numeric"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            onBlur={() => {
              const cid = Number(clienteId.trim());
              if (Number.isFinite(cid) && cid > 0) void loadPreview(cid);
            }}
            placeholder="100"
            className="w-24 rounded border border-slate-300 px-2 py-1 font-mono text-sm dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-0.5 block font-semibold text-slate-600 dark:text-slate-400">Arquivo JPEG</span>
          <input
            type="file"
            accept="image/jpeg,.jpg"
            disabled={busy}
            onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
        </label>
        <button
          type="button"
          disabled={busy || !clienteId.trim()}
          onClick={() => void onRemove()}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600"
        >
          Remover
        </button>
      </div>
      {preview ?
        <img src={preview} alt="Preview logotipo" className="mt-3 max-h-16 rounded border border-slate-200 dark:border-slate-700" />
      : null}
    </div>
  );
}

export function PortalPlayerIdsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState({ total: 0, linked: 0, unlinked: 0 });
  const [syncedPdvIds, setSyncedPdvIds] = useState<Set<number>>(new Set());
  const [gatewayStatusOk, setGatewayStatusOk] = useState(false);
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [rioSourceYm, setRioSourceYm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pilotSteps, setPilotSteps] = useState<PilotStep[] | null>(null);
  const [pilotReady, setPilotReady] = useState(false);

  const loadGatewayStatus = useCallback(async (list: Row[]) => {
    const pdvIds = list.flatMap((r) => (r.link ? [r.link.portalPdvId] : []));
    const clienteIds = list.flatMap((r) => (r.link ? [r.link.portalClienteId] : []));
    if (pdvIds.length === 0) {
      setGatewayStatusOk(true);
      setSyncedPdvIds(new Set());
      return;
    }
    try {
      const res = await fetch("/api/player/gateway-status", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdvIds, clienteIds }),
      });
      const data = (await res.json()) as { ok?: boolean; syncedPdvIds?: number[]; error?: string };
      if (!res.ok || !data.ok) {
        setGatewayStatusOk(false);
        setSyncedPdvIds(new Set());
        return;
      }
      setGatewayStatusOk(true);
      setSyncedPdvIds(new Set(data.syncedPdvIds ?? []));
    } catch {
      setGatewayStatusOk(false);
      setSyncedPdvIds(new Set());
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const catRes = await fetch("/api/cadastros/producao-catalog");
      const cat = (await catRes.json()) as { ok?: boolean; rioSourceYearMonth?: number };
      if (cat.ok && cat.rioSourceYearMonth) setRioSourceYm(cat.rioSourceYearMonth);
      const vRes = await fetch(
        `/api/cadastros/month/${cat.rioSourceYearMonth ?? currentBrazilYearMonth()}/vinculos`,
      );
      const vData = (await vRes.json()) as {
        ok?: boolean;
        rows?: Row[];
        stats?: { total: number; linked: number; unlinked: number };
        error?: string;
      };
      if (!vRes.ok || !vData.ok) throw new Error(vData.error ?? "erro");
      setRows(vData.rows ?? []);
      setStats(vData.stats ?? { total: 0, linked: 0, unlinked: 0 });
      await loadGatewayStatus(vData.rows ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [loadGatewayStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runPlayerIdAssignBatches(
    onlyMissing: boolean,
    sync: boolean,
    onProgress: (detail: string) => void,
  ): Promise<{
    clientes: number;
    pdvs: number;
    gateway?: { clientes: number; pdvs: number } | null;
  }> {
    let offset = 0;
    let hasMore = true;
    let last: {
      clientes?: number;
      pdvs?: number;
      gateway?: { clientes: number; pdvs: number } | null;
      nextOffset?: number;
      total?: number;
    } = {};

    while (hasMore) {
      const res = await fetch("/api/player/portal-ids/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sync: hasMore ? false : sync,
          onlyMissing,
          offset,
          reset: !onlyMissing && offset === 0,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        clientes?: number;
        pdvs?: number;
        hasMore?: boolean;
        nextOffset?: number;
        total?: number;
        applied?: number;
        gateway?: { clientes: number; pdvs: number } | null;
      };
      if (!res.ok) throw new Error(data.error ?? "falhou");

      last = data;
      hasMore = Boolean(data.hasMore);
      offset = data.nextOffset ?? offset;
      const total = data.total ?? 0;
      onProgress(
        onlyMissing ?
          `Atribuindo IDs… ${Math.min(offset, total)}/${total || "…"}`
        : `Realinhando IDs… ${Math.min(offset, total)}/${total || "…"}`,
      );
    }

    return {
      clientes: last.clientes ?? 0,
      pdvs: last.pdvs ?? 0,
      gateway: last.gateway,
    };
  }

  async function realinharIds(sync = true) {
    if (busy) return;
    if (
      !window.confirm(
        "Substitui todos os IDs pela organização da produção musical (100, 100.001…), em lotes de 10. " +
          "Numeração antiga do painel legado / Rio será descartada. Logins e logotipos órfãos são removidos. " +
          "Depois, use «Login Player» na produção por cliente. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const data = await runPlayerIdAssignBatches(false, sync, setMsg);
      setMsg(
        `IDs realinhados: ${data.clientes} clientes, ${data.pdvs} PDVs.` +
          (data.gateway ?
            ` Gateway: ${data.gateway.clientes} clientes, ${data.gateway.pdvs} PDVs.`
          : ""),
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao realinhar IDs.");
    } finally {
      setBusy(false);
    }
  }

  async function atribuirSomenteFaltantes(sync = true) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const data = await runPlayerIdAssignBatches(true, sync, setMsg);
      if (data.clientes === 0 && data.pdvs === 0) {
        setMsg("Todos os clientes e PDVs já tinham ID — nada alterado.");
      } else {
        setMsg(
          `IDs atribuídos (somente faltantes): ${data.clientes} clientes, ${data.pdvs} PDVs.` +
            (data.gateway ?
              ` Gateway: ${data.gateway.clientes} clientes, ${data.gateway.pdvs} PDVs.`
            : ""),
        );
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao atribuir IDs.");
    } finally {
      setBusy(false);
    }
  }

  async function syncGateway(pdvIds?: number[]) {
    if (busy) return;
    setBusy(true);
    const pendentes = pdvIds?.length ?? null;
    setMsg(
      pendentes != null ?
        `Sincronizando ${pendentes} PDV(s) pendente(s)…`
      : "Sincronizando Player 5 (10 PDVs por vez)…",
    );
    try {
      const { clientes, pdvs } = await runPlayerGatewaySyncBatches((synced, total) => {
        setMsg(
          total != null ?
            `Sincronizando Player 5… ${Math.min(synced, total)}/${total} PDVs`
          : `Sincronizando Player 5… ${synced} PDV(s) enviados`,
        );
      }, pdvIds);
      setMsg(`Player 5 sincronizado: ${clientes} clientes, ${pdvs} PDVs.`);
      await loadGatewayStatus(rows);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setBusy(false);
    }
  }

  const rowsComId = rows.filter((r): r is Row & { link: NonNullable<Row["link"]> } => r.link != null);
  const pendentesSync = rowsComId.filter((r) => !syncedPdvIds.has(r.link.portalPdvId));
  const sincronizados = rowsComId.filter((r) => syncedPdvIds.has(r.link.portalPdvId));
  const semId = rows.filter((r) => !r.link);

  async function syncPendentes() {
    if (pendentesSync.length === 0) {
      setMsg("Nenhum PDV pendente de sync no gateway.");
      return;
    }
    const ids = pendentesSync.map((r) => r.link.portalPdvId);
    await syncGateway(ids);
  }

  async function verificarPiloto() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    setPilotSteps(null);
    try {
      const res = await fetch("/api/player/pilot");
      const data = (await res.json()) as {
        error?: string;
        steps?: PilotStep[];
        ready?: boolean;
        testCliente?: { portalClienteId: number; nome: string; email: string | null };
      };
      if (!res.ok) throw new Error(data.error ?? "falhou");
      setPilotSteps(data.steps ?? []);
      setPilotReady(Boolean(data.ready));
      if (data.ready) {
        setMsg("Piloto pronto — pode testar no Player 5. Veja docs/PLAYER5-PILOTO.md");
      } else if (data.testCliente) {
        setMsg(
          `Pendências no checklist. Cliente teste sugerido: ${data.testCliente.nome} (ID ${data.testCliente.portalClienteId}, ${data.testCliente.email ?? "sem e-mail"}).`,
        );
      } else {
        setMsg("Checklist abaixo — complete os passos antes de abrir o Player 5.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao verificar piloto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">IDs Player</h1>
          <p className="mt-1 text-sm text-slate-500">
            Numeração conforme a <strong>produção musical</strong> (pastas/grupos), não a Planilha Rio.
            Ex.: Hering = cliente <strong>100</strong>; lojas dentro = PDVs <strong>100.001</strong>…
            Use <strong>Realinhar IDs</strong> para substituir numeração migrada do painel legado.
            IDs gravados no catálogo operacional — a Planilha Rio nunca é alterada por estas ações.
            {rioSourceYm != null ?
              <> Espelho Rio (leitura): {formatYearMonthLabel(rioSourceYm)}.</>
            : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void realinharIds(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Realinhar IDs à produção
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void atribuirSomenteFaltantes(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
          >
            Só faltantes…
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void syncGateway()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
          >
            Sincronizar todos
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void verificarPiloto()}
            className="rounded-lg border border-sky-400 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-200"
          >
            Verificar piloto
          </button>
        </div>
      </div>

      {pilotSteps ?
        <div className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs font-bold uppercase text-slate-500">
            Checklist Player 5 {pilotReady ? "· pronto" : "· pendências"}
          </p>
          <ul className="space-y-1 text-sm">
            {pilotSteps.map((s) => (
              <li key={s.id} className="flex gap-2">
                <span className={s.ok ? "text-emerald-600" : "text-amber-600"}>{s.ok ? "✓" : "○"}</span>
                <span>
                  <strong>{s.label}</strong> — {s.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      : null}

      {msg ?
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          {msg}
        </div>
      : null}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span>
          {stats.linked}/{stats.total} com ID · {stats.unlinked} sem ID
        </span>
        {gatewayStatusOk ?
          <>
            <span className="text-emerald-700 dark:text-emerald-400">
              {sincronizados.length} sync no gateway
            </span>
            <span className="text-amber-700 dark:text-amber-400">
              {pendentesSync.length} pendente(s)
            </span>
          </>
        : <span className="text-amber-600">Status gateway indisponível — rode sync ou recarregue.</span>}
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={somentePendentes}
            onChange={(e) => setSomentePendentes(e.target.checked)}
            className="rounded border-slate-300"
          />
          Mostrar só pendentes em cima
        </label>
      </div>

      {loading ?
        <p className="text-sm text-slate-400">Carregando…</p>
      : rows.length === 0 ?
        <p className="text-sm text-slate-400">Nenhum PDV na produção musical vigente.</p>
      : <>
          <section className="mb-8">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Pendentes de sync
                </h2>
                <p className="text-xs text-slate-500">
                  PDVs com ID atribuído que ainda não estão no gateway Player 5.
                </p>
              </div>
              <button
                type="button"
                disabled={busy || pendentesSync.length === 0}
                onClick={() => void syncPendentes()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Sincronizar pendentes ({pendentesSync.length})
              </button>
            </div>
            <IdsTable rows={pendentesSync} syncedPdvIds={syncedPdvIds} showSyncBadge={false} />
          </section>

          {!somentePendentes ?
            <>
              <section className="mb-8">
                <div className="mb-2">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Sincronizados
                  </h2>
                  <p className="text-xs text-slate-500">
                    Já enviados ao gateway — badge <strong className="text-emerald-600">Sync</strong> ao
                    lado do ID PDV.
                  </p>
                </div>
                <IdsTable rows={sincronizados} syncedPdvIds={syncedPdvIds} showSyncBadge />
              </section>

              {semId.length > 0 ?
                <section className="mb-8">
                  <div className="mb-2">
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Sem ID Player</h2>
                    <p className="text-xs text-slate-500">
                      Atribua IDs com «Só faltantes» ou «Realinhar IDs» antes de sincronizar.
                    </p>
                  </div>
                  <IdsTable rows={semId} syncedPdvIds={syncedPdvIds} showSyncBadge={false} />
                </section>
              : null}
            </>
          : null}
        </>
      }

      <ClienteLogotipoBlock busy={busy} setBusy={setBusy} setMsg={setMsg} />
    </div>
  );
}
