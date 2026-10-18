import { getDb, newId, type FinanceDB } from "./db";
import { assertValid, ValidationError } from "@/domain/errors";
import { validateBudget } from "@/domain/planning";
import type { Budget } from "@/domain/types";

export type BudgetDraft = Pick<Budget, "categoryId" | "month" | "currency" | "amount">;

export async function saveBudget(
  draft: BudgetDraft,
  id?: string,
  db: FinanceDB = getDb(),
): Promise<Budget> {
  return db.transaction("rw", db.categories, db.budgets, async () => {
    const previous = id ? await db.budgets.get(id) : undefined;
    if (id && !previous) throw new ValidationError(["Orçamento não encontrado."]);
    assertValid(validateBudget(draft, await db.categories.toArray(), previous));
    const duplicate = await db.budgets
      .where("[categoryId+month]")
      .equals([draft.categoryId, draft.month])
      .first();
    if (duplicate && duplicate.id !== id)
      throw new ValidationError([
        "Esta categoria já tem um orçamento neste mês. Edite o limite existente.",
      ]);
    const now = new Date().toISOString();
    const budget: Budget = {
      ...draft,
      id: previous?.id ?? newId(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    await db.budgets.put(budget);
    return budget;
  });
}

export async function deleteBudget(id: string, db: FinanceDB = getDb()) {
  await db.budgets.delete(id);
}
