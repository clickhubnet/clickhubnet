import { prisma } from "@/lib/prisma";
import type { CreateUserInput, UpdateUserInput } from "@/modules/usuarios/types/user";

const userPublicSelect = {
  id: true,
  authUserId: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  title: true,
  avatarUrl: true,
  theme: true,
  permissions: true,
  passwordChangedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export class UserRepository {
  async findMany() {
    return prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: userPublicSelect,
      take: 100,
    });
  }

  async create(data: CreateUserInput) {
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.password,
        phone: data.phone,
        title: data.title,
        role: data.role,
        status: data.status,
        permissions: data.permissions ?? {},
      },
      select: userPublicSelect,
    });
  }

  async update(id: string, data: UpdateUserInput) {
    const { password, ...rest } = data;
    return prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(password ? { passwordHash: password, passwordChangedAt: new Date() } : {}),
      },
      select: userPublicSelect,
    });
  }

  async softDelete(id: string) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: userPublicSelect,
    });
  }
}
