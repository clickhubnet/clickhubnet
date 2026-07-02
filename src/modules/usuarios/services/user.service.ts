import { UserRepository } from "@/repositories/user.repository";
import { hashPassword } from "@/lib/password";
import { createUserSchema, updateUserSchema } from "@/modules/usuarios/schemas/user.schema";
import type { CreateUserInput, UpdateUserInput } from "@/modules/usuarios/types/user";

export class UserService {
  constructor(private readonly userRepository = new UserRepository()) {}

  async list() {
    return this.userRepository.findMany();
  }

  async create(input: CreateUserInput) {
    const parsed = createUserSchema.parse(input);
    return this.userRepository.create({
      ...(parsed as CreateUserInput),
      permissions: parsed.role === "ADMIN" ? {} : parsed.permissions,
      password: parsed.password ? await hashPassword(parsed.password) : undefined,
    });
  }

  async update(id: string, input: UpdateUserInput) {
    const parsed = updateUserSchema.parse(input);
    return this.userRepository.update(id, {
      ...(parsed as UpdateUserInput),
      ...(parsed.role === "ADMIN" ? { permissions: {} } : {}),
      password: parsed.password ? await hashPassword(parsed.password) : undefined,
    });
  }

  async block(id: string) {
    return this.userRepository.update(id, { status: "BLOCKED" });
  }

  async delete(id: string) {
    return this.userRepository.softDelete(id);
  }
}
