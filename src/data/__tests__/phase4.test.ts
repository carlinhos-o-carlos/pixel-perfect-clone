import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FinanceDB, newId } from "../db";
import { saveBudget, deleteBudget } from "../budgets";
import { createCategory, deleteCategory, setCategoryArchived } from "../categories";
import { createAccount } from "../accounts";
import { createTransaction } from "../transactions";
import { createRecurringRule, deleteRecurringRule } from "../recurring";
import { budgetUsage, cashFlow, planningTransactions } from "@/domain/planning";

let db: FinanceDB;
let categoryId: string;
beforeEach(async () => {
  db = new FinanceDB(`phase4-${newId()}`);
  await db.open();
  const cat = await db.categories.where("key").equals("expense_food").first();
  if (!cat) throw new Error("Missing food category");
  categoryId = cat.id;
});
afterEach(async () => {
  await db.delete();
});
const draft = () => ({ categoryId, month: "2026-10", currency: "BRL", amount: 10000 });

describe("Phase 4 persistence", () => {
  it("creates, edits, reopens and removes a monthly budget without modifying entries", async () => {
    const b = await saveBudget(draft(), undefined, db);
    await saveBudget({ ...draft(), amount: 15000 }, b.id, db);
    db.close();
    await db.open();
    expect((await db.budgets.get(b.id))?.amount).toBe(15000);
    await deleteBudget(b.id, db);
    expect(await db.budgets.count()).toBe(0);
    expect(await db.categories.get(categoryId)).toBeDefined();
  });
  it("rejects duplicate category/month limits even in concurrent writes; permits another month", async () => {
    const results = await Promise.allSettled([
      saveBudget(draft(), undefined, db),
      saveBudget(draft(), undefined, db),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(saveBudget({ ...draft(), currency: "USD" }, undefined, db)).rejects.toThrow(
      /já tem/,
    );
    await saveBudget({ ...draft(), month: "2026-11" }, undefined, db);
    expect(await db.budgets.count()).toBe(2);
  });
  it("preserves archived-category budgets and history while blocking a new selection", async () => {
    const b = await saveBudget(draft(), undefined, db);
    const account = await createAccount(
      { name: "Banco", kind: "checking", currency: "BRL", openingBalance: 100000 },
      db,
    );
    await createTransaction(
      {
        type: "expense",
        status: "confirmed",
        date: "2026-10-10",
        amount: 2500,
        accountId: account.id,
        categoryId,
        description: "Mercado",
      },
      db,
    );
    await setCategoryArchived(categoryId, true, db);
    await saveBudget({ ...draft(), amount: 12000 }, b.id, db);
    await expect(saveBudget({ ...draft(), month: "2026-11" }, undefined, db)).rejects.toThrow(
      /arquivada/,
    );
    const usage = budgetUsage(
      await db.budgets.toArray(),
      await db.transactions.toArray(),
      "2026-10",
      "2026-10-16",
      "BRL",
    )[0];
    expect([usage?.used, usage?.remaining]).toEqual([2500, 9500]);
  });
  it("protects a custom budget category from physical deletion", async () => {
    const cat = await createCategory({ name: "Pets", kind: "expense" }, db);
    await saveBudget({ ...draft(), categoryId: cat.id }, undefined, db);
    await expect(deleteCategory(cat.id, db)).rejects.toThrow(/orçamentos/);
    expect(await db.categories.get(cat.id)).toBeDefined();
  });
  it("rejects invalid amounts, category kinds and dates without partial writes", async () => {
    const income = await db.categories.where("kind").equals("income").first();
    if (!income) throw new Error("Missing income category");
    for (const value of [
      { ...draft(), amount: 0 },
      { ...draft(), amount: 1.5 },
      { ...draft(), month: "2026-13" },
      { ...draft(), categoryId: income.id },
    ])
      await expect(saveBudget(value, undefined, db)).rejects.toThrow();
    expect(await db.budgets.count()).toBe(0);
  });
  it("rule deletion updates projection while preserving confirmed history and budget usage", async () => {
    const account = await createAccount(
      { name: "Banco", kind: "checking", currency: "BRL", openingBalance: 100000 },
      db,
    );
    const rule = await createRecurringRule(
      {
        name: "Aluguel",
        type: "expense",
        amount: 10000,
        accountId: account.id,
        categoryId,
        frequency: "monthly",
        dayOfMonth: 20,
        startDate: "2026-10-20",
      },
      db,
    );
    await createTransaction(
      {
        type: "expense",
        status: "confirmed",
        date: "2026-10-10",
        amount: 3000,
        accountId: account.id,
        categoryId,
        description: "Compra",
      },
      db,
    );
    const merge = async () =>
      planningTransactions(
        await db.transactions.toArray(),
        await db.recurringRules.toArray(),
        await db.skippedOccurrences.toArray(),
        "2026-10-01",
        "2026-10-31",
      );
    expect(
      cashFlow([account], await merge(), "2026-10-01", "2026-10-31", "2026-10-16", "BRL")
        .projectedClosing,
    ).toBe(87000);
    expect(await db.transactions.count()).toBe(1);
    await deleteRecurringRule(rule.id, { mode: "rule-only" }, db, "2026-10-16");
    expect(
      cashFlow([account], await merge(), "2026-10-01", "2026-10-31", "2026-10-16", "BRL")
        .projectedClosing,
    ).toBe(97000);
    expect(await db.transactions.count()).toBe(1);
  });
});
