import { describePortalAuditAction } from "@/lib/audit/describeAuditAction";
import { prisma } from "@/lib/prisma";

export type RecordPortalAuditInput = {
  userEmail: string;
  userDisplayName?: string;
  method: string;
  path: string;
  query?: string;
  ip?: string;
  userAgent?: string;
  actionOverride?: string;
};

export async function recordPortalAuditLog(input: RecordPortalAuditInput): Promise<void> {
  const email = input.userEmail.trim().toLowerCase();
  if (!email) return;

  const user = await prisma.portalUser.findUnique({
    where: { email },
    select: { id: true, displayName: true },
  });

  const action = describePortalAuditAction(
    input.path,
    input.method,
    input.actionOverride,
  );

  await prisma.portalAuditLog.create({
    data: {
      userEmail: email,
      userDisplayName: input.userDisplayName?.trim() || user?.displayName || email,
      userId: user?.id ?? null,
      action,
      method: input.method.toUpperCase().slice(0, 10),
      path: input.path.slice(0, 500),
      query: (input.query ?? "").slice(0, 500),
      ip: (input.ip ?? "").slice(0, 64),
      userAgent: (input.userAgent ?? "").slice(0, 500),
    },
  });
}

export type PortalAuditLogRow = {
  id: string;
  userEmail: string;
  userDisplayName: string;
  action: string;
  method: string;
  path: string;
  query: string;
  ip: string;
  createdAt: Date;
};

export async function listPortalAuditLogs(opts: {
  page: number;
  pageSize: number;
  userEmail?: string;
  search?: string;
}): Promise<{ rows: PortalAuditLogRow[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const skip = (page - 1) * pageSize;

  const where: {
    userEmail?: { contains: string; mode: "insensitive" };
    OR?: Array<{ action?: { contains: string; mode: "insensitive" }; path?: { contains: string; mode: "insensitive" } }>;
  } = {};

  if (opts.userEmail?.trim()) {
    where.userEmail = { contains: opts.userEmail.trim(), mode: "insensitive" };
  }

  const q = opts.search?.trim();
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { path: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.portalAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        userEmail: true,
        userDisplayName: true,
        action: true,
        method: true,
        path: true,
        query: true,
        ip: true,
        createdAt: true,
      },
    }),
    prisma.portalAuditLog.count({ where }),
  ]);

  return { rows, total };
}
