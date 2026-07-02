import { ExpenseStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ExpenseInput = {
  description?: string;
  amount?: number;
  status?: ExpenseStatus;
  paymentMethod?: string;
  dueAt?: string;
  notes?: string;
};

export class ExpenseRepository {
  async findMany() {
    await prisma.expense.updateMany({
      where: { deletedAt: null, status: "PENDING", paidAt: null, dueAt: { lt: startOfToday() } },
      data: { status: "OVERDUE" },
    });
    return prisma.expense.findMany({ where: { deletedAt: null }, orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }] });
  }

  async create(input: Required<Pick<ExpenseInput, "description" | "amount" | "status">> & ExpenseInput) {
    return prisma.expense.create({ data: normalize(input) as Prisma.ExpenseCreateInput });
  }

  async update(id: string, input: ExpenseInput) {
    return prisma.expense.update({ where: { id }, data: normalize(input) as Prisma.ExpenseUpdateInput });
  }

  async delete(id: string) {
    return prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

function normalize(input: ExpenseInput) {
  const status = input.status;
  return {
    ...input,
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod.trim() || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(`${input.dueAt}T12:00:00`) : null } : {}),
    ...(status === "PAID" ? { paidAt: new Date() } : status ? { paidAt: null } : {}),
  };
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
