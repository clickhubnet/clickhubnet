import { ExpenseRepository, type ExpenseInput } from "@/repositories/expense.repository";
import { expenseSchema, updateExpenseSchema } from "@/modules/despesas/schemas/expense.schema";

export class ExpenseService {
  constructor(private readonly repository = new ExpenseRepository()) {}
  list() { return this.repository.findMany(); }
  create(input: ExpenseInput) { return this.repository.create(expenseSchema.parse(input)); }
  update(id: string, input: ExpenseInput) { return this.repository.update(id, updateExpenseSchema.parse(input)); }
  delete(id: string) { return this.repository.delete(id); }
}
