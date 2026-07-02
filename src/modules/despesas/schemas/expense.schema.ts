import { z } from "zod";

export const expenseSchema = z.object({
  description: z.string().min(2, "Informe a descrição."),
  amount: z.coerce.number().positive("Informe um valor maior que zero."),
  status: z.enum(["PENDING", "PAID", "OVERDUE"]).default("PENDING"),
  paymentMethod: z.string().optional(),
  dueAt: z.string().optional(),
  notes: z.string().optional(),
});

export const updateExpenseSchema = expenseSchema.partial();
