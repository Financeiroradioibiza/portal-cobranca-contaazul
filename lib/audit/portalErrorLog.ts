import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ErrorLogLevel = "error" | "warn" | "info";
export type ErrorLogSource = "client" | "render" | "api" | "server";

export type RecordPortalErrorInput = {
  level?: ErrorLogLevel;
  source?: ErrorLogSource;
  message: string;
  stack?: string;
  path?: string;
  method?: string;
  status?: number | null;
  userEmail?: string;
  userAgent?: string;
  context?: unknown;
};

function clampLevel(v: unknown): ErrorLogLevel {
  return v === "warn" || v === "info" ? v : "error";
}

function clampSource(v: unknown): ErrorLogSource {
  return v === "render" || v === "api" || v === "server" ? v : "client";
}

function toJsonContext(v: unknown): Prisma.InputJsonValue {
  if (v == null) return {};
  try {
    // Garante serializável e limita tamanho.
    const s = JSON.stringify(v);
    if (s.length > 8000) return { truncated: true, preview: s.slice(0, 8000) };
    return JSON.parse(s) as Prisma.InputJsonValue;
  } catch {
    return { unserializable: String(v).slice(0, 2000) };
  }
}

export async function recordPortalErrorLog(input: RecordPortalErrorInput): Promise<void> {
  const message = (input.message ?? "").toString().trim();
  if (!message) return;

  try {
    await prisma.portalErrorLog.create({
      data: {
        level: clampLevel(input.level),
        source: clampSource(input.source),
        message: message.slice(0, 4000),
        stack: (input.stack ?? "").toString().slice(0, 8000),
        path: (input.path ?? "").toString().slice(0, 500),
        method: (input.method ?? "").toString().toUpperCase().slice(0, 10),
        status: typeof input.status === "number" && Number.isFinite(input.status) ? input.status : null,
        userEmail: (input.userEmail ?? "").toString().toLowerCase().slice(0, 200),
        userAgent: (input.userAgent ?? "").toString().slice(0, 500),
        context: toJsonContext(input.context),
      },
    });
  } catch (e) {
    // Nunca deixar o logger derrubar a request.
    console.error("[portalErrorLog] falha ao gravar", e);
  }
}

export type PortalErrorLogRow = {
  id: string;
  level: string;
  source: string;
  message: string;
  stack: string;
  path: string;
  method: string;
  status: number | null;
  userEmail: string;
  userAgent: string;
  context: unknown;
  createdAt: Date;
};

export async function listPortalErrorLogs(opts: {
  page: number;
  pageSize: number;
  level?: string;
  source?: string;
  search?: string;
}): Promise<{ rows: PortalErrorLogRow[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(500, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;

  const where: Prisma.PortalErrorLogWhereInput = {};
  if (opts.level && opts.level !== "all") where.level = opts.level;
  if (opts.source && opts.source !== "all") where.source = opts.source;

  const q = opts.search?.trim();
  if (q) {
    where.OR = [
      { message: { contains: q, mode: "insensitive" } },
      { path: { contains: q, mode: "insensitive" } },
      { userEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.portalErrorLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.portalErrorLog.count({ where }),
  ]);

  return { rows: rows as PortalErrorLogRow[], total };
}

export async function clearPortalErrorLogs(beforeId?: string): Promise<number> {
  if (beforeId) {
    const ref = await prisma.portalErrorLog.findUnique({
      where: { id: beforeId },
      select: { createdAt: true },
    });
    if (!ref) return 0;
    const res = await prisma.portalErrorLog.deleteMany({
      where: { createdAt: { lte: ref.createdAt } },
    });
    return res.count;
  }
  const res = await prisma.portalErrorLog.deleteMany({});
  return res.count;
}
