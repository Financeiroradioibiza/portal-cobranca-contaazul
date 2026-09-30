"use client";

import { useCallback, useEffect, useState } from "react";

export type ChamadoAnexoListItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByNome: string;
  createdAt: string;
};

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileUrl(id: string, kind: "chamado" | "conversa"): string {
  return `/api/chamados/anexos/${id}/file?kind=${kind}`;
}

export function ChamadoAnexosBlock({ chamadoId }: { chamadoId: string }) {
  const [anexos, setAnexos] = useState<ChamadoAnexoListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chamados/${chamadoId}/anexos`, { credentials: "same-origin" });
      const data = res.ok ? await res.json() : null;
      const rows = (data as { anexos?: ChamadoAnexoListItem[] })?.anexos;
      setAnexos(Array.isArray(rows) ? rows : []);
    } catch {
      setAnexos([]);
    }
  }, [chamadoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/chamados/${chamadoId}/anexos`, {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok) {
        setErr("Não foi possível enviar o arquivo.");
        return;
      }
      await load();
    } catch {
      setErr("Erro de rede ao enviar arquivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Anexos</p>
        <label className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">
          {busy ? "Enviando…" : "+ Arquivo"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            accept="image/*,audio/*,video/*,application/pdf,.zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {err ?
        <p className="mt-1 text-[11px] text-rose-600">{err}</p>
      : null}
      {anexos.length === 0 ?
        <p className="mt-2 text-[11px] text-slate-400">Nenhum anexo (imagem, PDF, MP3… até 10 MB).</p>
      : <ul className="mt-2 space-y-2">
          {anexos.map((a) => (
            <li key={a.id} className="text-xs">
              <a
                href={fileUrl(a.id, "chamado")}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-violet-700 hover:underline dark:text-violet-300"
              >
                {a.fileName}
              </a>
              <span className="text-slate-400">
                {" "}
                · {fmtSize(a.sizeBytes)} · {a.uploadedByNome}
              </span>
              {a.mimeType.startsWith("image/") ?
                <img
                  src={fileUrl(a.id, "chamado")}
                  alt=""
                  className="mt-1 max-h-40 max-w-full rounded border border-slate-200 dark:border-slate-700"
                />
              : null}
              {a.mimeType.startsWith("audio/") ?
                <audio controls className="mt-1 w-full max-w-md" src={fileUrl(a.id, "chamado")} />
              : null}
            </li>
          ))}
        </ul>
      }
    </div>
  );
}

export function ConversaAnexoPreview({
  anexo,
}: {
  anexo: { id: string; fileName: string; mimeType: string; sizeBytes: number };
}) {
  const url = fileUrl(anexo.id, "conversa");
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-950/50">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-violet-700 dark:text-violet-300">
        {anexo.fileName}
      </a>
      <span className="ml-1 text-[10px] text-slate-400">({fmtSize(anexo.sizeBytes)})</span>
      {anexo.mimeType.startsWith("image/") ?
        <img src={url} alt="" className="mt-1 max-h-48 max-w-full rounded" />
      : null}
      {anexo.mimeType.startsWith("audio/") ?
        <audio controls className="mt-1 w-full" src={url} />
      : null}
    </div>
  );
}
