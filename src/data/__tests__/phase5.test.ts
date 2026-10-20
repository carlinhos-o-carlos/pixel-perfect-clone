import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { FinanceDB, newId } from "../db";
import { createAccount } from "../accounts";
import { createTransaction } from "../transactions";
import {
  addAssetValuation,
  addDebtBalance,
  addGoalAllocation,
  allocateDebtPayment,
  createAsset,
  createDebt,
  createGoal,
  deleteAsset,
  deleteDebt,
  deleteGoal,
  deleteGoalAllocation,
  readWealth,
  registerDebtPayment,
  settleDebt,
  updateAsset,
  updateGoal,
  updateGoalAllocation,
} from "../wealth";
import { ValidationError } from "@/domain/errors";
import { debtStatus, goalProgress, netWorthByCurrency } from "@/domain/wealth";

let db: FinanceDB;
beforeEach(async () => {
  db = new FinanceDB(`t-${newId()}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const D = "2026-01-10";
const asset = { name: "Carro", assetType: "vehicle" as const, currency: "BRL", countedInAccounts: false };
const debtIn = { name: "Empréstimo", debtType: "loan" as const, currency: "BRL" };
const checking = (openingBalance: number) =>
  createAccount({ name: "Corrente", kind: "checking", currency: "BRL", openingBalance }, db);

async function nw() {
  const w = await readWealth(db);
  return netWorthByCurrency({ ...w, today: w.today }).BRL!;
}

describe("phase 5 — assets", () => {
  it("creates, edits and revalues without changing history or transactions", async () => {
    const acc = await checking(10_000);
    const a = await createAsset(asset, 3_000_000, D, db);
    await updateAsset(a.id, { ...asset, name: "Carro 2020" }, db);
    await addAssetValuation(a.id, 2_800_000, "2026-06-01", db);
    await addAssetValuation(a.id, 0, "2026-06-02", db); // zero is valid
    const vals = await db.assetValuations.where("assetId").equals(a.id).toArray();
    expect(vals.map((v) => v.value).sort()).toEqual([0, 2_800_000, 3_000_000]);
    expect((await db.assets.get(a.id))?.name).toBe("Carro 2020");
    expect(await db.transactions.count()).toBe(0);
    expect((await nw()).assets).toBe(0);
    expect((await db.accounts.get(acc.id))?.openingBalance).toBe(10_000);
  });

  it("rejects invalid values, dates and missing data", async () => {
    await expect(createAsset(asset, -1, D, db)).rejects.toThrow(ValidationError);
    await expect(createAsset(asset, 1.5, D, db)).rejects.toThrow(ValidationError);
    await expect(createAsset(asset, 1, "2026-02-30", db)).rejects.toThrow(ValidationError);
    await expect(createAsset({ ...asset, name: " " }, 1, D, db)).rejects.toThrow(ValidationError);
    await expect(addAssetValuation("missing", 1, D, db)).rejects.toThrow(ValidationError);
  });

  it("does not double count assets already inside an account", async () => {
    await checking(500_000);
    await createAsset({ ...asset, name: "CDB na corretora", assetType: "other_investment", countedInAccounts: true }, 500_000, D, db);
    const n = await nw();
    expect(n.assetsExcluded).toBe(500_000);
    expect(n.netWorth).toBe(500_000);
  });

  it("deletes an asset with its history atomically", async () => {
    const a = await createAsset(asset, 1, D, db);
    await deleteAsset(a.id, db);
    expect(await db.assetValuations.count()).toBe(0);
    await expect(deleteAsset(a.id, db)).rejects.toThrow(ValidationError);
  });
});

describe("phase 5 — debts and net worth", () => {
  it("credit-card negative balance is a liability once, never also a debt", async () => {
    await checking(100_000);
    await createAccount({ name: "Cartão", kind: "credit_card", currency: "BRL", openingBalance: -30_000 }, db);
    const n = await nw();
    expect(n.accountsNegative).toBe(30_000);
    expect(n.debts).toBe(0);
    expect(n.totalLiabilities).toBe(30_000);
    expect(n.netWorth).toBe(70_000);
  });

  it("loan proceeds raise the account and the liability without changing net worth, once", async () => {
    const acc = await checking(0);
    const d = await createDebt(debtIn, 1_000_000, D, { accountId: acc.id }, db);
    expect(await db.transactions.where("debtId").equals(d.id).count()).toBe(1);
    const n = await nw();
    expect(n.accountsPositive).toBe(1_000_000);
    expect(n.debts).toBe(1_000_000);
    expect(n.netWorth).toBe(0);
  });

  it("pending payment keeps net worth; allocation reduces debt by principal only", async () => {
    const acc = await checking(500_000);
    const d = await createDebt(debtIn, 300_000, D, undefined, db);
    expect((await nw()).netWorth).toBe(200_000);
    const tx = await registerDebtPayment(d.id, { accountId: acc.id, date: "2026-02-01", amount: 50_000, requestId: newId() }, db);
    let n = await nw();
    expect(n.pendingPayments).toBe(50_000);
    expect(n.debts).toBe(300_000);
    expect(n.netWorth).toBe(200_000); // before allocation
    await expect(allocateDebtPayment(tx.id, { principal: 40_000, interest: 5_000, fees: 0 }, db)).rejects.toThrow(ValidationError);
    await allocateDebtPayment(tx.id, { principal: 40_000, interest: 8_000, fees: 2_000 }, db);
    n = await nw();
    expect(n.pendingPayments).toBe(0);
    expect(n.debts).toBe(260_000);
    expect(n.netWorth).toBe(190_000); // after: only interest + fees reduce it
    await expect(allocateDebtPayment(tx.id, { principal: 50_000, interest: 0, fees: 0 }, db)).rejects.toThrow(ValidationError);
  });

  it("a double submitted payment is stored once", async () => {
    const acc = await checking(100_000);
    const d = await createDebt(debtIn, 50_000, D, undefined, db);
    const requestId = newId();
    const p = { accountId: acc.id, date: "2026-02-01", amount: 10_000, requestId, split: { principal: 10_000, interest: 0, fees: 0 } };
    await registerDebtPayment(d.id, p, db);
    await registerDebtPayment(d.id, p, db);
    expect(await db.transactions.where("debtId").equals(d.id).count()).toBe(1);
  });

  it("manual balance update and settlement preserve history", async () => {
    const acc = await checking(100_000);
    const d = await createDebt(debtIn, 50_000, D, undefined, db);
    await registerDebtPayment(d.id, { accountId: acc.id, date: "2026-02-01", amount: 10_000, requestId: newId(), split: { principal: 10_000, interest: 0, fees: 0 } }, db);
    await addDebtBalance(d.id, 42_000, "2026-03-01", db); // bank statement includes interest
    const snaps = await db.debtBalances.where("debtId").equals(d.id).toArray();
    const txs = await db.transactions.toArray();
    expect(debtStatus((await db.debts.get(d.id))!, snaps, txs, "2026-10-01").balance).toBe(42_000);
    await settleDebt(d.id, "2026-04-01", db);
    expect((await db.debts.get(d.id))?.status).toBe("paid");
    expect(await db.debtBalances.where("debtId").equals(d.id).count()).toBe(3);
    expect(await db.transactions.where("debtId").equals(d.id).count()).toBe(1);
    expect((await nw()).debts).toBe(0);
    await expect(deleteDebt(d.id, db)).rejects.toThrow(ValidationError);
    await expect(registerDebtPayment(d.id, { accountId: acc.id, date: D, amount: 1, requestId: newId() }, db)).rejects.toThrow(ValidationError);
  });

  it("rejects invalid debts and missing references", async () => {
    await expect(createDebt(debtIn, -1, D, undefined, db)).rejects.toThrow(ValidationError);
    await expect(createDebt(debtIn, 1, "x", undefined, db)).rejects.toThrow(ValidationError);
    await expect(createDebt(debtIn, 1, D, { accountId: "missing" }, db)).rejects.toThrow(ValidationError);
    expect(await db.debts.count()).toBe(0);
    await expect(registerDebtPayment("missing", { accountId: "x", date: D, amount: 1, requestId: newId() }, db)).rejects.toThrow(ValidationError);
    const unused = await createDebt(debtIn, 0, D, undefined, db);
    await deleteDebt(unused.id, db);
    expect(await db.debtBalances.count()).toBe(0);
  });
});

describe("phase 5 — goals", () => {
  it("creates, edits and tracks capped progress", async () => {
    await checking(200_000);
    const g = await createGoal({ name: "Viagem", goalType: "travel", currency: "BRL", target: 100_000 }, db);
    expect(goalProgress(g, []).percent).toBe(0);
    await addGoalAllocation(g.id, { date: D, amount: 150_000 }, db);
    await updateGoal(g.id, { name: "Viagem Japão", goalType: "travel", currency: "BRL", target: 100_000, targetDate: "2027-05-01" }, db);
    const p = goalProgress((await db.goals.get(g.id))!, await db.goalAllocations.toArray());
    expect(p.percent).toBe(100);
    expect(p.surplus).toBe(50_000);
    expect(p.remaining).toBe(0);
    await expect(createGoal({ name: "X", goalType: "custom", currency: "BRL", target: 0 }, db)).rejects.toThrow(ValidationError);
  });

  it("earmarks never add to net worth nor exceed available money", async () => {
    await checking(100_000);
    const a = await createGoal({ name: "Reserva", goalType: "emergency_fund", currency: "BRL", target: 500_000 }, db);
    const b = await createGoal({ name: "Carro", goalType: "purchase", currency: "BRL", target: 500_000 }, db);
    await addGoalAllocation(a.id, { date: D, amount: 80_000 }, db);
    await expect(addGoalAllocation(b.id, { date: D, amount: 30_000 }, db)).rejects.toThrow(ValidationError);
    await addGoalAllocation(b.id, { date: D, amount: 20_000 }, db);
    expect((await nw()).netWorth).toBe(100_000);
    expect(await db.transactions.count()).toBe(0);
    const [row] = await db.goalAllocations.where("goalId").equals(b.id).toArray();
    await updateGoalAllocation(b.id, row!.id, { date: D, amount: 10_000 }, db);
    await expect(addGoalAllocation(b.id, { date: D, amount: -20_000 }, db)).rejects.toThrow(ValidationError);
    await deleteGoalAllocation(row!.id, db);
    await expect(addGoalAllocation(a.id, { date: D, amount: 0 }, db)).rejects.toThrow(ValidationError);
  });

  it("archived goals reject contributions and delete removes earmarks only", async () => {
    const acc = await checking(100_000);
    await createTransaction({ type: "income", status: "confirmed", date: D, amount: 1, accountId: acc.id, categoryId: (await db.categories.where("kind").equals("income").first())!.id, description: "x" }, db);
    const g = await createGoal({ name: "Casa", goalType: "home", currency: "BRL", target: 10 }, db);
    await addGoalAllocation(g.id, { date: D, amount: 5 }, db);
    await db.goals.update(g.id, { status: "archived" });
    await expect(addGoalAllocation(g.id, { date: D, amount: 1 }, db)).rejects.toThrow(ValidationError);
    await deleteGoal(g.id, db);
    expect(await db.goalAllocations.count()).toBe(0);
    expect(await db.transactions.count()).toBe(1);
  });
});

describe("phase 5 — persistence and migration", () => {
  it("data survives reopening the database", async () => {
    const a = await createAsset(asset, 1_000, D, db);
    const name = db.name;
    db.close();
    db = new FinanceDB(name);
    await db.open();
    expect((await db.assets.get(a.id))?.value).toBe(1_000);
  });

  it("upgrades a v2 database keeping existing rows and seeding histories", async () => {
    const name = `t-${newId()}`;
    const old = new Dexie(name);
    old.version(20).stores({
      accounts: "id, kind, currency, archived",
      categories: "id, &key, kind, archived",
      transactions:
        "id, date, type, status, accountId, destinationAccountId, categoryId, debtId, &[recurringRuleId+occurrenceDate]",
      recurringRules: "id, active",
      skippedOccurrences: "id, &[recurringRuleId+occurrenceDate]",
      debts: "id, status",
      assets: "id, assetType",
      goals: "id, status",
      goalAllocations: "id, goalId",
      budgets: "id, &[categoryId+month], month",
      settings: "id",
    });
    await old.open();
    await old.table("assets").add({ id: "a1", name: "Casa", assetType: "real_estate", currency: "BRL", value: 9, valuationDate: D });
    await old.table("debts").add({ id: "d1", name: "Fin", debtType: "financing", currency: "BRL", openingBalance: 7, openingDate: D, status: "active" });
    old.close();
    const up = new FinanceDB(name);
    try {
      await up.open();
      expect((await up.assets.get("a1"))?.archived).toBe(false);
      expect((await up.assetValuations.where("assetId").equals("a1").first())?.value).toBe(9);
      expect((await up.debtBalances.where("debtId").equals("d1").first())?.balance).toBe(7);
    } finally {
      await up.delete();
    }
  });
});
