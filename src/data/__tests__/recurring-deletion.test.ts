import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceDB, newId } from "../db";
import { createAccount } from "../accounts";
import { createTransaction, updateTransaction } from "../transactions";
import { createRecurringRule, deleteRecurringRule, endRecurringRule, saveOccurrence, setRecurringRuleActive } from "../recurring";
import { projectOccurrences } from "@/domain/recurring";
import { computeBalances, monthSummary } from "@/domain/transactions";

let db: FinanceDB;
beforeEach(async () => { db = new FinanceDB(`delete-recurring-${newId()}`); await db.open(); });
afterEach(async () => { vi.restoreAllMocks(); await db.delete(); });

async function fixture() {
  const account = await createAccount({ name: "Banco", kind: "checking", currency: "BRL", openingBalance: 10000 }, db);
  const destination = await createAccount({ name: "Reserva", kind: "savings", currency: "BRL", openingBalance: 0 }, db);
  const category = await db.categories.where("key").equals("expense_housing").first();
  if (!category) throw new Error("Categoria esperada");
  const draft = { name: "Aluguel", type: "expense" as const, amount: 2000, accountId: account.id, categoryId: category.id, startDate: "2026-01-01", frequency: "monthly" as const, dayOfMonth: 1 };
  const rule = await createRecurringRule(draft, db);
  const otherRule = await createRecurringRule({ ...draft, name: "Outra regra" }, db);
  const occurrences = projectOccurrences([rule], [], [], "2026-01-01", "2026-04-01");
  const [past, pastPlanned, future, futurePlanned] = occurrences;
  if (!past || !pastPlanned || !future || !futurePlanned) throw new Error("Ocorrências esperadas");
  const confirmed = await saveOccurrence({ ...past, amount: 1750, description: "Editado confirmado" }, "confirmed", db);
  const pendingPast = await saveOccurrence(pastPlanned, "planned", db);
  const scheduled = await saveOccurrence(future, "confirmed", db);
  const pendingFuture = await saveOccurrence({ ...futurePlanned, amount: 1234 }, "planned", db);
  const independent = await createTransaction({ type: "expense", status: "confirmed", date: "2026-01-02", amount: 500, accountId: account.id, categoryId: category.id, description: "Independente" }, db);
  const transfer = await createTransaction({ type: "transfer", status: "confirmed", date: "2026-01-02", amount: 1000, accountId: account.id, destinationAccountId: destination.id, description: "Transferência" }, db);
  const otherOccurrence = projectOccurrences([otherRule], [], [], "2026-01-01", "2026-01-01")[0];
  if (!otherOccurrence) throw new Error("Ocorrência esperada");
  const other = await saveOccurrence(otherOccurrence, "confirmed", db);
  await db.skippedOccurrences.bulkAdd([
    { id: "skip-selected", recurringRuleId: rule.id, occurrenceDate: "2026-05-01" },
    { id: "skip-other", recurringRuleId: otherRule.id, occurrenceDate: "2026-05-01" },
  ]);
  return { account, destination, category, rule, otherRule, confirmed, pendingPast, scheduled, pendingFuture, independent, transfer, other };
}

describe("exclusão segura de regras", () => {
  it.each(["active", "paused", "ended"])("exclui regra %s preservando confirmados e removendo só pendentes futuros", async (state) => {
    const f = await fixture();
    if (state === "paused") await setRecurringRuleActive(f.rule.id, false, db);
    if (state === "ended") await endRecurringRule(f.rule.id, "2026-02-15", db);
    const before = await db.transactions.toArray();
    await deleteRecurringRule(f.rule.id, { mode: "rule-only" }, db, "2026-02-15");
    expect(await db.recurringRules.get(f.rule.id)).toBeUndefined();
    expect(await db.transactions.get(f.pendingFuture.id)).toBeUndefined();
    for (const tx of [f.confirmed, f.scheduled, f.pendingPast]) {
      const { recurringRuleId: _rule, occurrenceDate: _date, ...expected } = tx;
      expect(await db.transactions.get(tx.id)).toEqual(expected);
    }
    for (const tx of [f.independent, f.transfer, f.other]) expect(await db.transactions.get(tx.id)).toEqual(tx);
    expect(await db.skippedOccurrences.toArray()).toEqual([{ id: "skip-other", recurringRuleId: f.otherRule.id, occurrenceDate: "2026-05-01" }]);
    const after = await db.transactions.toArray();
    const accounts = await db.accounts.toArray();
    expect(computeBalances(accounts, after, "2026-02-15")).toEqual(computeBalances(accounts, before, "2026-02-15"));
    expect(monthSummary(after, "2026-01", "2026-02-15")).toEqual(monthSummary(before, "2026-01", "2026-02-15"));
    expect(computeBalances(accounts, after, "2026-02-15", "projected")[f.account.id]).toBe(2750);
    db.close(); await db.open();
    expect(await db.recurringRules.get(f.rule.id)).toBeUndefined();
    expect(await db.transactions.toArray()).toEqual(after);
    expect(projectOccurrences(await db.recurringRules.toArray(), after, await db.skippedOccurrences.toArray(), "2026-01-01", "2026-06-01").some((o) => o.recurringRuleId === f.rule.id)).toBe(false);
    const retained = await db.transactions.get(f.confirmed.id);
    if (!retained) throw new Error("Lançamento preservado esperado");
    await updateTransaction(retained.id, { type: "expense", status: "confirmed", date: retained.date, amount: 1500, accountId: retained.accountId, categoryId: f.category.id, description: "Ainda editável" }, db);
    expect((await db.transactions.get(retained.id))?.amount).toBe(1500);
  });

  it("exige confirmação e recalcula saldos e relatórios ao remover histórico", async () => {
    const f = await fixture();
    const before = await db.transactions.toArray();
    await expect(deleteRecurringRule(f.rule.id, { mode: "rule-and-history", historyConfirmed: false }, db)).rejects.toThrow(/Confirme/);
    expect(await db.transactions.toArray()).toEqual(before);
    expect(await db.recurringRules.get(f.rule.id)).toEqual(f.rule);
    await deleteRecurringRule(f.rule.id, { mode: "rule-and-history", historyConfirmed: true }, db, "2026-02-15");
    const after = await db.transactions.toArray();
    expect(after).toHaveLength(3);
    for (const tx of [f.independent, f.transfer, f.other]) expect(await db.transactions.get(tx.id)).toEqual(tx);
    expect(computeBalances(await db.accounts.toArray(), after, "2026-02-15")[f.account.id]).toBe(6500);
    expect(monthSummary(after, "2026-01", "2026-02-15")).toEqual({ BRL: { income: 0, expense: 2500 } });
    db.close(); await db.open();
    expect(await db.transactions.toArray()).toEqual(after);
  });

  it("nunca apaga transferências nem vínculos sem data de ocorrência válida", async () => {
    const f = await fixture();
    await db.transactions.update(f.transfer.id, { recurringRuleId: f.rule.id, occurrenceDate: "2026-06-01" });
    await db.transactions.update(f.independent.id, { recurringRuleId: f.rule.id });
    await deleteRecurringRule(f.rule.id, { mode: "rule-and-history", historyConfirmed: true }, db);
    expect(await db.transactions.get(f.transfer.id)).toEqual(f.transfer);
    expect(await db.transactions.get(f.independent.id)).toEqual(f.independent);
  });

  it("reverte todas as alterações se uma escrita falhar", async () => {
    const f = await fixture();
    const before = await db.transactions.toArray();
    vi.spyOn(db.recurringRules, "delete").mockRejectedValueOnce(new Error("Falha simulada"));
    await expect(deleteRecurringRule(f.rule.id, { mode: "rule-only" }, db, "2026-02-15")).rejects.toThrow("Falha simulada");
    expect(await db.transactions.toArray()).toEqual(before);
    expect(await db.recurringRules.get(f.rule.id)).toEqual(f.rule);
    expect(await db.skippedOccurrences.count()).toBe(2);
  });
});