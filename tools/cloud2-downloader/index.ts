/**
 * Cloud2 Download Worker — Radio Ibiza
 * =====================================
 * Serviço HTTP que o portal chama para processar itens de download
 * pendentes (Spotizerr, Deemix, yt-dlp).
 *
 * O portal aponta CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL para:
 *   http://<cloud2-ip>:<PORT>/process
 *
 * Rotas:
 *   GET  /health         → { ok: true }
 *   POST /process        → processa até `limit` itens pendentes
 */

import http from "node:http";
import { processSpotizerr } from "./providers/spotizerr.ts";
import { processDeemix } from "./providers/deemix.ts";
import { processYoutube } from "./providers/youtube.ts";
import { getPrisma } from "./db.ts";
import type { DownloadProvider } from "@prisma/client";

const PORT = parseInt(process.env.PORT ?? "3002", 10);
const SECRET = process.env.CRIACAO_CLOUD2_DOWNLOAD_SECRET ?? "";

// -------------------------------------------------------------------------

type ProcessorFn = (itemId: string, linhaOriginal: string) => Promise<ProcessResult>;

type ProcessResult =
  | { ok: true; storageKey: string; arquivoNome: string; titulo: string; artista: string; sizeBytes: number | null }
  | { ok: false; error: string };

function providerProcessor(provider: DownloadProvider): ProcessorFn | null {
  switch (provider) {
    case "spotizerr": return processSpotizerr;
    case "deemix":   return processDeemix;
    case "youtube":  return processYoutube;
    default: return null;
  }
}

// -------------------------------------------------------------------------

async function handleProcess(body: { limit?: number; secret?: string }): Promise<{ processed: number }> {
  const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
  const prisma = getPrisma();

  const items = await prisma.downloadItem.findMany({
    where: { status: "aguardando" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { job: { select: { provider: true } } },
  });

  let processed = 0;

  for (const item of items) {
    const provider = item.job.provider;
    const fn = providerProcessor(provider);

    if (!fn) {
      await prisma.downloadItem.update({
        where: { id: item.id },
        data: { status: "erro", erroMsg: `Provedor "${String(provider)}" sem suporte neste worker.` },
      });
      processed++;
      continue;
    }

    // Marca como processando
    await prisma.downloadItem.update({
      where: { id: item.id },
      data: { status: "processando" },
    });

    try {
      const result = await fn(item.id, item.linhaOriginal);
      if (result.ok) {
        await prisma.downloadItem.update({
          where: { id: item.id },
          data: {
            status: "concluido",
            storageKey: result.storageKey,
            arquivoNome: result.arquivoNome,
            titulo: result.titulo,
            artista: result.artista,
            sizeBytes: result.sizeBytes,
          },
        });
      } else {
        await prisma.downloadItem.update({
          where: { id: item.id },
          data: { status: "erro", erroMsg: result.error.slice(0, 800) },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.downloadItem.update({
        where: { id: item.id },
        data: { status: "erro", erroMsg: msg.slice(0, 800) },
      });
    }

    // Atualiza contadores do job
    const counts = await prisma.downloadItem.groupBy({
      by: ["status"],
      where: { jobId: item.jobId },
      _count: true,
    });
    const done = counts.filter((c) => c.status === "concluido" || c.status === "erro").reduce((s, c) => s + c._count, 0);
    const pending = counts.find((c) => c.status === "aguardando")?._count ?? 0;
    const processing = counts.find((c) => c.status === "processando")?._count ?? 0;
    const errors = counts.find((c) => c.status === "erro")?._count ?? 0;
    const total = done + pending + processing;

    let jobStatus: "aguardando" | "processando" | "concluido" | "erro" | "cancelado" = "processando";
    if (pending === 0 && processing === 0) {
      jobStatus = errors === total && total > 0 ? "erro" : "concluido";
    } else if (pending === total) {
      jobStatus = "aguardando";
    }

    await prisma.downloadJob.update({
      where: { id: item.jobId },
      data: {
        itensFeitos: done,
        status: jobStatus,
        finishedAt: pending === 0 && processing === 0 ? new Date() : null,
        startedAt: { set: new Date() },
      },
    });

    processed++;
  }

  return { processed };
}

// -------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, code: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function checkAuth(req: http.IncomingMessage): boolean {
  if (!SECRET) return true;
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${SECRET}`;
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (url === "/health" && method === "GET") {
    json(res, 200, { ok: true, version: 1 });
    return;
  }

  if (url === "/process" && method === "POST") {
    if (!checkAuth(req)) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
    try {
      const raw = await readBody(req);
      const body = (raw ? JSON.parse(raw) : {}) as { limit?: number };
      const result = await handleProcess(body);
      json(res, 200, result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/process]", e);
      json(res, 500, { error: msg });
    }
    return;
  }

  json(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.log(`[cloud2-downloader] Rodando em http://0.0.0.0:${PORT}`);
  console.log(`[cloud2-downloader] SECRET configurado: ${Boolean(SECRET)}`);
});
