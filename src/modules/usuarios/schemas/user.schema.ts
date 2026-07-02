import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2, "Informe o nome completo."),
  email: z.string().email("Informe um e-mail valido."),
  password: z.string().min(8, "A senha deve possuir pelo menos 8 caracteres.").optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]),
  status: z.enum(["ACTIVE", "BLOCKED"]),
  permissions: z.record(z.boolean()).optional(),
});

export const updateUserSchema = createUserSchema.partial();
