import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { permissions } from "@/constants/permissions";

type InitialUser = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  title?: string;
  theme?: string;
  permissions?: Prisma.InputJsonValue;
};

const defaultEmployeePermissions: Record<string, boolean> = {
  [permissions.dashboardView]: true,
  [permissions.leadsView]: true,
  [permissions.leadsCreate]: true,
  [permissions.leadsEdit]: true,
  [permissions.leadsMoveKanban]: true,
  [permissions.conversationsView]: true,
  [permissions.appointmentsView]: true,
  [permissions.appointmentsCreate]: true,
  [permissions.appointmentsEdit]: true,
  [permissions.cepsView]: true,
  [permissions.settingsView]: true,
};

const fallbackUsers: InitialUser[] = [
  {
    name: "Joana",
    email: process.env.ADMIN_INITIAL_EMAIL ?? "joana@clickhubnet.com.br",
    password: process.env.ADMIN_INITIAL_PASSWORD ?? "roots2601",
    role: "ADMIN",
    title: "Administradora",
    theme: "light",
    permissions: {},
  },
  {
    name: "Yasmini",
    email: "yasmini@clickhubnet.com.br",
    password: "acesso@2026",
    role: "EMPLOYEE",
    title: "Operadora",
  },
  {
    name: "Tata",
    email: "tata@clickhubnet.com.br",
    password: "acesso@2026",
    role: "EMPLOYEE",
    title: "Operadora",
  },
];

const globalForInitialUsers = globalThis as typeof globalThis & {
  initialUsersEnsured?: Promise<void>;
};

export function getInitialUsers() {
  const rawUsers = process.env.INITIAL_USERS_JSON?.trim();

  if (!rawUsers) {
    return fallbackUsers;
  }

  const parsed = JSON.parse(rawUsers) as InitialUser[];
  return parsed.length ? parsed : fallbackUsers;
}

export async function ensureInitialUsers() {
  const users = getInitialUsers();
  const createdUsers = [];

  for (const user of users) {
    const passwordHash = await hashPassword(user.password);
    const role = user.role ?? "EMPLOYEE";
    const theme = user.theme ?? "light";
    const normalizedEmail = user.email.toLowerCase().trim();
    const resolvedPermissions =
      role === "ADMIN" ? {} : (user.permissions ?? defaultEmployeePermissions);

    const savedUser = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        name: user.name,
        passwordHash,
        role,
        status: "ACTIVE",
        deletedAt: null,
        title: user.title,
        theme,
        permissions: resolvedPermissions,
        passwordChangedAt: new Date(),
      },
      create: {
        name: user.name,
        email: normalizedEmail,
        passwordHash,
        role,
        status: "ACTIVE",
        title: user.title,
        permissions: resolvedPermissions,
        theme,
        passwordChangedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    createdUsers.push(savedUser);
  }

  return createdUsers;
}

export async function ensureInitialUsersOnce() {
  if (!globalForInitialUsers.initialUsersEnsured) {
    globalForInitialUsers.initialUsersEnsured = ensureInitialUsers().then(() => undefined);
  }

  return globalForInitialUsers.initialUsersEnsured;
}
