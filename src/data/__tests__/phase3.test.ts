import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount } from "../accounts";
import { FinanceDB, newId } from "../db";
import {
  createRecurringRule,
  endRecurringRule,
  saveOccurrence,
  setRecurringRuleActive,
  updateRecurringRule,
  type RecurringRuleDraft,
} from "../recurring";
import { occurrenceDates, projectOccurrences } from "@/domain/recurring";
import { computeBalances } from "@/domain/transactions";
import { deleteTransaction, updateTransaction } from "../transactions";
import { isISODate } from "@/domain/recurring";

let db: FinanceDB;
let accountId: string;
let categoryId: string;

beforeEach(async () => {
  db = new FinanceDB(`phase3-${newId()}`);
  await db.open();
  accountId = (
    await createAccount(
      { name: "Banco", kind: "checking", currency: "BRL", openingBalance: 10_000 },
      db,
    )
  ).id;
  categoryId = (await db.categories.where("key").equals("expense_housing").first())?.id ?? "";
});

afterEach(async () => {
  await db.delete();
});

function draft(changes: Partial<RecurringRuleDraft> = {}): RecurringRuleDraft {
  return {
    name: "Aluguel",
    type: "expense",
    amount: 2_000,
    accountId,
    categoryId,
    startDate: "2026-01-31",
    frequency: "monthly",
    dayOfMonth: 31,
    ...changes,
  };
}

describe("calendário recorrente", () => {
  it("gera semanal e quinzenal sem retroagir", () => {
    expect(
      occurrenceDates({ ...draft(), frequency: "weekly", interval: 1 }, "2026-01-01", "2026-02-15"),
    ).toEqual(["2026-01-31", "2026-02-07", "2026-02-14"]);
    expect(
      occurrenceDates(
        { ...draft(), frequency: "biweekly", interval: 1 },
        "2026-01-01",
        "2026-03-01",
      ),
    ).toEqual(["2026-01-31", "2026-02-14", "2026-02-28"]);
  });

  it("ajusta dias 28, 29, 30 e 31 e respeita ano bissexto", () => {
    expect(occurrenceDates({ ...draft(), interval: 1 }, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
    expect(
      occurrenceDates(
        { ...draft(), startDate: "2024-01-31", interval: 1 },
        "2024-01-01",
        "2024-03-31",
      ),
    ).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });

  it("gera anual e limita início e término de forma inclusiva", () => {
    expect(
      occurrenceDates(
        {
          ...draft(),
          frequency: "yearly",
          startDate: "2024-02-29",
          dayOfMonth: 29,
          endDate: "2026-02-28",
          interval: 1,
        },
        "2023-01-01",
        "2030-01-01",
      ),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });
});

describe("persistência das recorrências", () => {
  it("mantém previsão fora do saldo e confirmação sem duplicar", async () => {
    const rule = await createRecurringRule(draft(), db);
    const occurrence = projectOccurrences([rule], [], [], "2026-01-01", "2026-02-28")[0];
    expect(occurrence).toBeDefined();
    expect(computeBalances(await db.accounts.toArray(), [], "2026-02-28")[accountId]).toBe(10_000);
    if (!occurrence) throw new Error("Ocorrência esperada");
    await saveOccurrence(occurrence, "confirmed", db);
    await saveOccurrence(occurrence, "confirmed", db);
    expect(await db.transactions.count()).toBe(1);
    expect(
      computeBalances(await db.accounts.toArray(), await db.transactions.toArray(), "2026-02-28")[
        accountId
      ],
    ).toBe(8_000);
  });

  it("edita a regra sem alterar histórico nem uma ocorrência editada", async () => {
    const rule = await createRecurringRule(draft(), db);
    const occurrence = projectOccurrences([rule], [], [], "2026-01-01", "2026-03-31")[0];
    if (!occurrence) throw new Error("Ocorrência esperada");
    const stored = await saveOccurrence(
      { ...occurrence, amount: 1_750, description: "Aluguel ajustado" },
      "planned",
      db,
    );
    const updated = await updateRecurringRule(
      rule.id,
      draft({ amount: 3_000, dayOfMonth: 15 }),
      db,
      "2026-02-01",
    );
    expect((await db.transactions.get(stored.id))?.amount).toBe(1_750);
    const projected = projectOccurrences(
      [updated],
      await db.transactions.toArray(),
      [],
      "2026-01-01",
      "2026-03-31",
    );
    expect(
      projected.some((item) => item.transaction?.id === stored.id && item.amount === 1_750),
    ).toBe(true);
    expect(projected.some((item) => !item.transaction && item.amount === 3_000)).toBe(true);
  });

  it("pausa, retoma e persiste após reabrir", async () => {
    const rule = await createRecurringRule(draft(), db);
    await setRecurringRuleActive(rule.id, false, db);
    expect(
      projectOccurrences(await db.recurringRules.toArray(), [], [], "2026-01-01", "2026-12-31"),
    ).toEqual([]);
    await setRecurringRuleActive(rule.id, true, db);
    db.close();
    await db.open();
    expect((await db.recurringRules.get(rule.id))?.active).toBe(true);
    expect(
      projectOccurrences(await db.recurringRules.toArray(), [], [], "2026-01-01", "2026-12-31")
        .length,
    ).toBeGreaterThan(0);
  });

  it("confirmação futura é agendada e não afeta o saldo de hoje", async () => {
    const rule = await createRecurringRule(draft(), db);
    const occurrence = projectOccurrences([rule], [], [], "2026-02-01", "2026-02-28")[0];
    if (!occurrence) throw new Error("Ocorrência esperada");
    await Promise.all([saveOccurrence(occurrence, "confirmed", db), saveOccurrence(occurrence, "confirmed", db)]);
    expect(await db.transactions.count()).toBe(1);
    expect(computeBalances(await db.accounts.toArray(), await db.transactions.toArray(), "2026-02-01")[accountId]).toBe(10000);
  });

  it("preserva datas passadas e histórico confirmado ao editar a regra", async () => {
    const rule = await createRecurringRule(draft(), db);
    const occurrence = projectOccurrences([rule], [], [], "2026-01-01", "2026-01-31")[0];
    if (!occurrence) throw new Error("Ocorrência esperada");
    const tx = await saveOccurrence(occurrence, "confirmed", db);
    const next = await updateRecurringRule(rule.id, draft({amount: 3000}), db, "2026-02-01");
    expect(await db.transactions.get(tx.id)).toEqual(tx);
    const virtual = projectOccurrences([next], [], [], "2026-01-01", "2026-03-31");
    expect(virtual.map((o) => o.amount)).toEqual([2000,3000,3000]);
    expect(await saveOccurrence(occurrence, "planned", db)).toEqual(tx);
  });

  it("exclusão de ocorrência não regenera e encerramento preserva histórico", async () => {
    const rule = await createRecurringRule(draft(), db);
    const occurrences = projectOccurrences([rule], [], [], "2026-01-01", "2026-03-31");
    const first = occurrences[0]; const second = occurrences[1];
    if (!first || !second) throw new Error("Ocorrências esperadas");
    const tx = await saveOccurrence(first, "confirmed", db);
    await saveOccurrence(second, "planned", db);
    await deleteTransaction(tx.id, db);
    expect(projectOccurrences([rule], await db.transactions.toArray(), await db.skippedOccurrences.toArray(), "2026-01-01", "2026-03-31").some((o) => o.occurrenceDate === first.occurrenceDate)).toBe(false);
    await endRecurringRule(rule.id, "2026-03-01", db);
    expect(await db.transactions.count()).toBe(1);
    await expect(setRecurringRuleActive(rule.id, true, db)).rejects.toThrow(/encerrada/);
  });

  it("edição individual persiste inclusive após alterar agenda e reabrir", async () => {
    const rule = await createRecurringRule(draft(), db);
    const occurrence = projectOccurrences([rule], [], [], "2026-01-01", "2026-01-31")[0];
    if (!occurrence) throw new Error("Ocorrência esperada");
    const tx = await saveOccurrence(occurrence, "planned", db);
    await updateTransaction(tx.id, {type:"expense", status:"planned", date:"2026-02-02", amount:1234, accountId, categoryId, description:"Individual"}, db);
    const next = await updateRecurringRule(rule.id, draft({amount:9999}), db, "2026-02-01");
    db.close(); await db.open();
    const result = projectOccurrences([next], await db.transactions.toArray(), [], "2026-02-01", "2026-03-31");
    expect(result.find((o) => o.transaction?.id === tx.id)?.amount).toBe(1234);
  });

  it("rejeita datas impossíveis e valores inválidos", async () => {
    expect(isISODate("2026-99-99")).toBe(false);
    expect(isISODate("2026-02-29")).toBe(false);
    await expect(createRecurringRule(draft({amount:1.2}), db)).rejects.toThrow(/maior/);
    await expect(createRecurringRule(draft({endDate:"2025-01-01"}), db)).rejects.toThrow(/anterior/);
  });

  it("migra v1 preservando registros e aplica índice único", async () => {
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(1).stores({ accounts:"id, kind, currency, archived", categories:"id, &key, kind, archived", transactions:"id, date, type, status, accountId, destinationAccountId, categoryId, debtId, [recurringRuleId+occurrenceDate]", recurringRules:"id, active", skippedOccurrences:"id, &[recurringRuleId+occurrenceDate]", debts:"id, status", assets:"id, assetType", goals:"id, status", goalAllocations:"id, goalId", budgets:"id, &[categoryId+month], month", settings:"id" });
    await old.open();
    const account = await db.accounts.get(accountId);
    await old.table("accounts").put(account);
    await old.table("settings").put({id:"app", schemaVersion:1});
    old.close();
    const upgraded = new FinanceDB(name);
    try {
      await upgraded.open();
      expect(await upgraded.accounts.get(accountId)).toEqual(account);
      expect((await upgraded.settings.get("app"))?.schemaVersion).toBe(2);
      await upgraded.transactions.add({id:"one", recurringRuleId:"r", occurrenceDate:"2026-01-01"} as never);
      await expect(upgraded.transactions.add({id:"two", recurringRuleId:"r", occurrenceDate:"2026-01-01"} as never)).rejects.toThrow();
    } finally {await upgraded.delete();}
  });
});
