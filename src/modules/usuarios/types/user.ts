import type { Prisma, UserRole, UserStatus } from "@prisma/client";

export type CreateUserInput = {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  title?: string;
  role: UserRole;
  status: UserStatus;
  permissions?: Prisma.InputJsonValue;
};

export type UpdateUserInput = Partial<CreateUserInput>;
