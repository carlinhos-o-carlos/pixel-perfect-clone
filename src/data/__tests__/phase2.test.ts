import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FinanceDB, newId } from "../db";
import { createAccount, deleteAccount, setAccountArchived, updateAccount } from "../accounts";
import { createCategory, deleteCategory, renameCategory, setCategoryArchived } from "../categories";
import { createTransaction, deleteTransaction, updateTransaction } from "../transactions";
import { computeBalances, monthSummary } from "@/domain/transactions";
import { ValidationError } from "@/domain/errors";
import type { TransactionDraft } from "@/domain/transactions";

let db: FinanceDB;
const TODAY = "2026-10-14";
let catId: (key: string) => Promise<string>;

beforeEach(async () => {
  db = new FinanceDB(`t-${newId()}`);
  await db.open();
  catId = async (key) => (await db.categories.where("key").equals(key).first())!.id;
});
afterEach(async () => {
  await db.delete();
});

async function balances(mode: "actual" | "projected" = "actual") {
  return computeBalances(await db.accounts.toArray(), await db.transactions.toArray(), TODAY, mode);
}
const brl = (name: string, openingBalance = 0) =>
  createAccount({ name, kind: "checking", currency: "BRL", openingBalance }, db);

async function draft(p: Partial<TransactionDraft> & { accountId: string }): Promise<TransactionDraft> {
  return {
    type: "expense",
    status: "confirmed",
    date: "2026-10-10",
    amount: 1000,
    description: "Teste",
    categoryId: p.type === "transfer" ? undefined : await catId(p.type === "income" ? "income_salary" : "expense_food"),
    ...p,
  };
}

describe("accounts", () => {
  it("creates, edits and archives; opening balance can be negative or zero", async () => {
    const a = await brl("Banco", -5000);
    expect((await balances())[a.id]).toBe(-5000);
    await updateAccount(a.id, { name: "Banco X", kind: "savings", currency: "BRL", openingBalance: 0 }, db);
    expect((await db.accounts.get(a.id))?.name).toBe("Banco X");
    await setAccountArchived(a.id, true, db);
    expect((await db.accounts.get(a.id))?.archived).toBe(true);
  });
  it("rejects invalid accounts and positive card opening balances", async () => {
    await expect(brl("  ")).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createAccount({ name: "Cartão", kind: "credit_card", currency: "BRL", openingBalance: 100 }, db),
    ).rejects.toThrow(/Cartão/);
  });
  it("never physically deletes an account with transactions", async () => {
    const a = await brl("A");
    await createTransaction(await draft({ accountId: a.id }), db);
    await expect(deleteAccount(a.id, db)).rejects.toThrow(/Arquive/);
    await expect(
      updateAccount(a.id, { name: "A", kind: "checking", currency: "USD", openingBalance: 0 }, db),
    ).rejects.toThrow(/moeda/);
    const b = await brl("B");
    await deleteAccount(b.id, db);
    expect(await db.accounts.get(b.id)).toBeUndefined();
  });
});

describe("balances", () => {
  it("income adds, expense subtracts, planned and future entries do not count", async () => {
    const a = await brl("A", 10000);
    await createTransaction(await draft({ accountId: a.id, type: "income", amount: 5000 }), db);
    await createTransaction(await draft({ accountId: a.id, amount: 2000 }), db);
    await createTransaction(await draft({ accountId: a.id, amount: 999, status: "planned" }), db);
    await createTransaction(await draft({ accountId: a.id, amount: 111, date: "2026-10-20" }), db);
    expect((await balances())[a.id]).toBe(13000);
    expect((await balances("projected"))[a.id]).toBe(13000 - 999 - 111);
    const s = monthSummary(await db.transactions.toArray(), "2026-10", TODAY);
    expect(s.BRL).toEqual({ income: 5000, expense: 2000 });
  });

  it("transfer is one row, moves money and is not income/expense", async () => {
    const a = await brl("A", 10000);
    const b = await brl("B");
    await createTransaction(await draft({ accountId: a.id, type: "transfer", destinationAccountId: b.id, amount: 3000 }), db);
    expect(await db.transactions.count()).toBe(1);
    const bal = await balances();
    expect(bal[a.id]).toBe(7000);
    expect(bal[b.id]).toBe(3000);
    expect(monthSummary(await db.transactions.toArray(), "2026-10", TODAY)).toEqual({});
  });

  it("rejects cross-currency, same-account and destination-less transfers", async () => {
    const a = await brl("A");
    const u = await createAccount({ name: "U", kind: "checking", currency: "USD", openingBalance: 0 }, db);
    await expect(createTransaction(await draft({ accountId: a.id, type: "transfer", destinationAccountId: u.id }), db)).rejects.toThrow(/moedas/);
    await expect(createTransaction(await draft({ accountId: a.id, type: "transfer", destinationAccountId: a.id }), db)).rejects.toThrow(/diferente/);
    await expect(createTransaction(await draft({ accountId: a.id, type: "transfer" }), db)).rejects.toThrow(/destino/);
    expect(await db.transactions.count()).toBe(0);
  });
});

describe("transaction validation", () => {
  it("rejects zero and negative amounts", async () => {
    const a = await brl("A");
    for (const amount of [0, -100, 1.5])
      await expect(createTransaction(await draft({ accountId: a.id, amount }), db)).rejects.toThrow(/maior que zero/);
  });
  it("rejects archived accounts and categories for new entries", async () => {
    const a = await brl("A");
    const food = await catId("expense_food");
    await setCategoryArchived(food, true, db);
    await expect(createTransaction(await draft({ accountId: a.id }), db)).rejects.toThrow(/arquivada/);
    await setCategoryArchived(food, false, db);
    await setAccountArchived(a.id, true, db);
    await expect(createTransaction(await draft({ accountId: a.id }), db)).rejects.toThrow(/arquivada/);
  });
  it("enforces category kind per type", async () => {
    const a = await brl("A");
    await expect(createTransaction(await draft({ accountId: a.id, type: "income", categoryId: await catId("expense_food") }), db)).rejects.toThrow(/combina/);
    await expect(createTransaction(await draft({ accountId: a.id, type: "expense", categoryId: await catId("income_salary") }), db)).rejects.toThrow(/combina/);
    await expect(createTransaction(await draft({ accountId: a.id, type: "expense", categoryId: undefined }), db)).rejects.toThrow(/categoria/);
    const t = await createTransaction(await draft({ accountId: a.id, type: "transfer", destinationAccountId: (await brl("B")).id, categoryId: await catId("transfer_investments") }), db);
    expect(t.categoryId).toBeTruthy();
  });
});

describe("edit and delete", () => {
  it("recalculates balances after edit, type change and delete", async () => {
    const a = await brl("A", 10000);
    const b = await brl("B");
    const t = await createTransaction(await draft({ accountId: a.id, amount: 2000 }), db);
    await updateTransaction(t.id, await draft({ accountId: a.id, amount: 500 }), db);
    expect((await balances())[a.id]).toBe(9500);
    await updateTransaction(t.id, await draft({ accountId: a.id, type: "transfer", destinationAccountId: b.id, amount: 4000 }), db);
    let bal = await balances();
    expect([bal[a.id], bal[b.id]]).toEqual([6000, 4000]);
    await updateTransaction(t.id, await draft({ accountId: a.id, type: "income", amount: 100 }), db);
    const stored = await db.transactions.get(t.id);
    expect(stored?.destinationAccountId).toBeUndefined();
    bal = await balances();
    expect([bal[a.id], bal[b.id]]).toEqual([10100, 0]);
    await expect(updateTransaction(t.id, await draft({ accountId: a.id, amount: 0 }), db)).rejects.toThrow();
    expect((await db.transactions.get(t.id))?.amount).toBe(100); // failed edit changes nothing
    await deleteTransaction(t.id, db);
    expect((await balances())[a.id]).toBe(10000);
  });
  it("keeps an archived account on an existing entry when editing", async () => {
    const a = await brl("A");
    const t = await createTransaction(await draft({ accountId: a.id }), db);
    await setAccountArchived(a.id, true, db);
    await updateTransaction(t.id, await draft({ accountId: a.id, description: "Editado" }), db);
    expect((await db.transactions.get(t.id))?.description).toBe("Editado");
  });
});

describe("categories", () => {
  it("creates, renames, archives; protects system and used categories", async () => {
    const c = await createCategory({ name: "Pets", kind: "expense" }, db);
    await expect(createCategory({ name: "pets", kind: "expense" }, db)).rejects.toThrow(/Já existe/);
    await renameCategory(c.id, "Animais", db);
    expect((await db.categories.get(c.id))?.name).toBe("Animais");
    await expect(deleteCategory(await catId("expense_food"), db)).rejects.toThrow(/sistema/);
    const a = await brl("A");
    await createTransaction(await draft({ accountId: a.id, categoryId: c.id }), db);
    await expect(deleteCategory(c.id, db)).rejects.toThrow(/Arquive/);
    await setCategoryArchived(c.id, true, db);
    expect((await db.categories.get(c.id))?.archived).toBe(true);
    const unused = await createCategory({ name: "Temp", kind: "income" }, db);
    await deleteCategory(unused.id, db);
    expect(await db.categories.get(unused.id)).toBeUndefined();
  });
  it("data persists across reopening the database", async () => {
    const a = await brl("A", 100);
    await createTransaction(await draft({ accountId: a.id }), db);
    db.close();
    await db.open();
    expect(await db.accounts.count()).toBe(1);
    expect(await db.transactions.count()).toBe(1);
  });
});
