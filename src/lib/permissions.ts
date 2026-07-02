import type { User } from "@prisma/client";
import { permissions } from "@/constants/permissions";

export type Permission = (typeof permissions)[keyof typeof permissions];

export function hasPermission(user: Pick<User, "role" | "permissions">, permission: Permission) {
  if (user.role === "ADMIN") {
    return true;
  }

  const userPermissions = normalizePermissions(user.permissions);
  return Boolean(userPermissions[permission]);
}

export function assertPermission(user: Pick<User, "role" | "permissions">, permission: Permission) {
  if (!hasPermission(user, permission)) {
    throw new Error("FORBIDDEN");
  }
}

function normalizePermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, boolean>;
}
