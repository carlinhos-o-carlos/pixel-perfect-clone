import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FinanceDB, newId } from "../db";
import { createAccount } from "../accounts";
import { addDebtBalance, allocateDebtPayment, createDebt, readWealth, registerDebtPayment } from "../wealth";
import { debtStatus, netWorthByCurrency } from "@/domain/wealth";
import type { Debt, DebtBalance, Transaction } from "@/domain/types";

const D = "2026-01-10";
const input = { name: "Correção", debtType: "loan" as const, currency: "BRL" };
let db: FinanceDB;
beforeEach(async () => { db = new FinanceDB(`correction-${newId()}`); await db.open(); });
afterEach(async () => { await db.delete(); });
async function setup() {
  const account = await createAccount({ name: "Conta", kind: "checking", currency: "BRL", openingBalance: 600_000 }, db);
  const debt = await createDebt(input, 500_000, D, undefined, db);
  return { account, debt };
}
async function status(debt: Debt, today = D) {
  return debtStatus(debt, await db.debtBalances.toArray(), await db.transactions.toArray(), today);
}
async function pay(debt: Debt, accountId: string, amount: number, date = D) {
  return registerDebtPayment(debt.id, { accountId, amount, date, requestId: newId(), split: { principal: amount, interest: 0, fees: 0 } }, db);
}

describe("debt balance correction", () => {
  it("5000 minus 500, 300 and 300 principal on opening day equals 3900", async () => {
    const { account, debt } = await setup();
    for (const amount of [50_000, 30_000, 30_000]) await pay(debt, account.id, amount);
    expect((await status(debt)).balance).toBe(390_000);
  });
  it("same-day pending allocation reduces once, preserves net worth and payment identity", async () => {
    const { account, debt } = await setup();
    const p = { accountId: account.id, date: D, amount: 50_000, requestId: newId() };
    const tx = await registerDebtPayment(debt.id, p, db);
    expect(await status(debt)).toMatchObject({ balance: 500_000, pending: 50_000 });
    let w = await readWealth(db);
    expect(netWorthByCurrency({ ...w, today: D }).BRL?.netWorth).toBe(100_000);
    const split = { principal: 40_000, interest: 8_000, fees: 2_000 };
    await allocateDebtPayment(tx.id, split, db);
    const classified = await db.transactions.get(tx.id);
    await Promise.all([allocateDebtPayment(tx.id, split, db), allocateDebtPayment(tx.id, split, db)]);
    await registerDebtPayment(debt.id, p, db); // original pending request after classification
    expect(await db.transactions.get(tx.id)).toEqual(classified);
    expect(await db.transactions.count()).toBe(1);
    expect(await status(debt)).toMatchObject({ balance: 460_000, pending: 0 });
    w = await readWealth(db);
    expect(netWorthByCurrency({ ...w, today: D }).BRL?.netWorth).toBe(90_000);
    await expect(allocateDebtPayment(tx.id, { principal: 50_000, interest: 0, fees: 0 }, db)).rejects.toThrow();
  });
  it("interest and fees never reduce principal", async () => {
    const { account, debt } = await setup();
    await registerDebtPayment(debt.id, { accountId: account.id, date: D, amount: 10_000, requestId: newId(), split: { principal: 0, interest: 8_000, fees: 2_000 } }, db);
    expect((await status(debt)).balance).toBe(500_000);
  });
  it("manual references include same-day payments even if classified later", async () => {
    const { account, debt } = await setup();
    await pay(debt, account.id, 50_000);
    const tx = await registerDebtPayment(debt.id, { accountId: account.id, date: D, amount: 30_000, requestId: newId() }, db);
    await addDebtBalance(debt.id, 420_000, D, db);
    await allocateDebtPayment(tx.id, { principal: 30_000, interest: 0, fees: 0 }, db);
    expect((await status(debt)).balance).toBe(420_000);
    await pay(debt, account.id, 30_000, "2026-01-11");
    expect((await status(debt, "2026-01-11")).balance).toBe(390_000);
    expect(await db.debtBalances.count()).toBe(2);
    expect(await db.transactions.count()).toBe(3);
  });
  it("concurrent payment replays store and deduct once; conflicting identity is rejected", async () => {
    const { account, debt } = await setup();
    const p = { accountId: account.id, date: D, amount: 50_000, requestId: newId(), split: { principal: 50_000, interest: 0, fees: 0 } };
    await Promise.all([registerDebtPayment(debt.id, p, db), registerDebtPayment(debt.id, p, db)]);
    expect(await db.transactions.count()).toBe(1);
    expect((await status(debt)).balance).toBe(450_000);
    await expect(registerDebtPayment(debt.id, { ...p, amount: 30_000, split: { principal: 30_000, interest: 0, fees: 0 } }, db)).rejects.toThrow();
    await expect(registerDebtPayment(debt.id, { ...p, date: "2026-01-11" }, db)).rejects.toThrow();
    await expect(registerDebtPayment(debt.id, { ...p, split: { principal: 40_000, interest: 10_000, fees: 0 } }, db)).rejects.toThrow();
    expect(await db.transactions.count()).toBe(1);
  });
  it("future principal and pending payments do not affect today's balance", async () => {
    const { account, debt } = await setup();
    await pay(debt, account.id, 50_000, "2026-01-11");
    await registerDebtPayment(debt.id, { accountId: account.id, date: "2026-01-11", amount: 30_000, requestId: newId() }, db);
    expect(await status(debt)).toMatchObject({ balance: 500_000, pending: 0 });
    expect(await status(debt, "2026-01-11")).toMatchObject({ balance: 450_000, pending: 30_000 });
  });
  it("future manual references are applied only on their date", async () => {
    const { account, debt } = await setup();
    await pay(debt, account.id, 50_000);
    await addDebtBalance(debt.id, 400_000, "2026-02-01", db);
    expect((await status(debt)).balance).toBe(450_000);
    expect((await status(debt, "2026-02-01")).balance).toBe(400_000);
  });
  it("classified payments, references and 3900 balance survive IndexedDB reopening", async () => {
    const { account, debt } = await setup();
    for (const amount of [50_000, 30_000, 30_000]) await pay(debt, account.id, amount);
    const transactions = await db.transactions.toArray();
    const history = await db.debtBalances.toArray();
    const name = db.name;
    db.close(); db = new FinanceDB(name); await db.open();
    expect(await db.transactions.toArray()).toEqual(transactions);
    expect(await db.debtBalances.toArray()).toEqual(history);
    expect((await status(debt)).balance).toBe(390_000);
  });
  it("opening fallback without history also includes opening-day principal", async () => {
    const { account, debt } = await setup();
    const tx = await pay(debt, account.id, 50_000);
    expect(debtStatus(debt, [], [tx], D).balance).toBe(450_000);
  });
});

describe("v4 history provenance migration", () => {
  it("preserves v3 amounts, IDs, payments and histories; ambiguous rows stay reconciled", async () => {
    const name = `legacy-${newId()}`;
    const old = new Dexie(name);
    old.version(3).stores({ debts: "id, status", debtBalances: "id, debtId", transactions: "id, debtId", settings: "id" });
    await old.open();
    const debt: Debt = { id: "d", ...input, openingBalance: 500_000, openingDate: D, status: "active", createdAt: "2026-01-10T10:00:00Z", updatedAt: "2026-01-10T10:00:00Z" };
    const rows: DebtBalance[] = [
      { id: "initial", debtId: "d", date: D, balance: 500_000, createdAt: debt.createdAt },
      { id: "manual", debtId: "d", date: "2026-01-11", balance: 420_000, createdAt: "2026-01-11T12:00:00Z" },
      { id: "tie1", debtId: "ambiguous", date: D, balance: 500_000, createdAt: debt.createdAt },
      { id: "tie2", debtId: "ambiguous", date: D, balance: 500_000, createdAt: debt.createdAt },
    ];
    const tx: Transaction = { id: "payment", type: "debt_payment", status: "confirmed", date: D, amount: 50_000, currency: "BRL", accountId: "a", debtId: "d", allocation: "allocated", principalAmount: 50_000, interestAmount: 0, feesAmount: 0, description: "Pagamento", createdAt: debt.createdAt, updatedAt: debt.createdAt };
    await old.table("debts").bulkAdd([debt, { ...debt, id: "ambiguous" }]);
    await old.table("debtBalances").bulkAdd(rows);
    await old.table("transactions").add(tx);
    await old.table("settings").add({ id: "app", schemaVersion: 3 });
    old.close();
    const upgraded = new FinanceDB(name);
    try {
      await upgraded.open();
      expect(await upgraded.debts.get("d")).toEqual(debt);
      expect(await upgraded.transactions.toArray()).toEqual([tx]);
      expect(await upgraded.debtBalances.count()).toBe(4);
      expect((await upgraded.debtBalances.get("initial"))?.kind).toBe("initial");
      for (const id of ["manual", "tie1", "tie2"]) expect((await upgraded.debtBalances.get(id))?.kind).toBe("legacy");
      const history = await upgraded.debtBalances.toArray();
      expect(history.map(({ kind: _kind, ...row }) => row)).toEqual([...rows].sort((a, b) => a.id.localeCompare(b.id)));
      expect(debtStatus(debt, history, [tx], D).balance).toBe(450_000);
      expect(debtStatus(debt, history, [tx], "2026-01-11").balance).toBe(420_000);
      expect((await upgraded.settings.get("app"))?.schemaVersion).toBe(4);
      upgraded.close(); await upgraded.open();
      expect(await upgraded.debtBalances.toArray()).toEqual(history);
    } finally { await upgraded.delete(); }
  });
});