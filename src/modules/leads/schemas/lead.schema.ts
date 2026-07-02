import { z } from "zod";

export const createLeadSchema = z.object({
  name: z.string().min(2, "Informe o nome do lead."),
  phone: z.string().min(10, "Informe um telefone valido."),
  email: z.string().email("Informe um e-mail valido.").optional().or(z.literal("")),
  cpfCnpj: z.string().optional(),
  birthDate: z.string().optional().or(z.literal("")),
  cep: z.string().optional(),
  address: z.string().optional(),
  streetNumber: z.string().optional(),
  complement: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  neighborhood: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  kanbanStageId: z.string().uuid().optional().or(z.literal("")),
  planId: z.string().uuid().optional().or(z.literal("")),
  planName: z.string().optional(),
  planValue: z.coerce.number().nonnegative().optional(),
  billingDueDay: z.coerce.number().int().min(1).max(31).optional().or(z.literal("")),
  assignedUserId: z.string().uuid().optional().or(z.literal("")),
  expectedValue: z.coerce.number().nonnegative().optional(),
});

export type CreateLeadSchema = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = createLeadSchema
  .extend({
    status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"]).optional(),
    kanbanStageId: z.string().uuid().optional().or(z.literal("")),
    assignedUserId: z.string().uuid().optional().or(z.literal("")),
    planId: z.string().uuid().optional().or(z.literal("")),
    expectedValue: z.coerce.number().nonnegative().optional(),
  })
  .partial();
