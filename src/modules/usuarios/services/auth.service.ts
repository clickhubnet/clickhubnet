import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signAuthToken } from "@/lib/jwt";
import { verifyPassword } from "@/lib/password";

type LoginInput = {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
};

export class AuthService {
  async login({ email, password, ip, userAgent }: LoginInput) {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
    });

    if (!user || !user.passwordHash) {
      await this.auditLogin(null, email, false, ip, userAgent);
      throw new Error("Credenciais invalidas.");
    }

    if (user.status !== "ACTIVE") {
      await this.auditLogin(user.id, email, false, ip, userAgent);
      throw new Error("Usuario bloqueado.");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      await this.auditLogin(user.id, email, false, ip, userAgent);
      throw new Error("Credenciais invalidas.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.auditLogin(user.id, email, true, ip, userAgent);

    const token = await signAuthToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      permissions: normalizePermissions(user.permissions),
    });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        permissions: user.permissions,
      },
    };
  }

  async logout(userId?: string, ip?: string, userAgent?: string) {
    if (!userId) {
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.LOGOUT,
        module: "auth",
        description: "Logout realizado.",
        ip,
        userAgent,
      },
    });
  }

  private async auditLogin(
    userId: string | null,
    email: string,
    success: boolean,
    ip?: string,
    userAgent?: string,
  ) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.LOGIN,
        module: "auth",
        description: success ? "Login realizado." : "Tentativa de login invalida.",
        metadata: { email, success },
        ip,
        userAgent,
      },
    });
  }
}

function normalizePermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}
