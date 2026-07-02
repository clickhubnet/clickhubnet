import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  userId?: string | null;
  action: AuditAction;
  module: string;
  description: string;
  metadata?: Prisma.InputJsonValue;
};

export async function logAudit({ userId, action, module, description, metadata }: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        module,
        description,
        metadata,
      },
    });
  } catch {
    // Audit must not block the business operation.
  }
}
