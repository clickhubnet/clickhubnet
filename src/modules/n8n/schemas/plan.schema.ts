import { z } from "zod";

export const createPlanSchema = z.object({
  name: z.string().min(2, "Informe o nome do plano."),
  speed: z.string().optional(),
  price: z.coerce.number().nonnegative("Informe um valor valido."),
  description: z.string().optional(),
  active: z.boolean().optional(),
  order: z.coerce.number().int().optional(),
});

export const updatePlanSchema = createPlanSchema.partial();
