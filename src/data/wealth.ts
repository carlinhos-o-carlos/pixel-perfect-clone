import { getDb, newId, type FinanceDB } from "./db";
import { assertValid, ValidationError } from "@/domain/errors";
import { todayISO } from "@/domain/dates";
import { computeBalances } from "@/domain/transactions";
import {
  allocationCapacity,
  debtStatus,
  validateAllocation,
  validateAsset,
  validateDebt,
  validateDebtBalance,
  validateGoal,
  validateSplit,
  validateValuation,
  type AssetInput,
  type DebtInput,
  type GoalInput,
  type PaymentSplit,
} from "@/domain/wealth";
import type { Asset, Debt, Goal, GoalAllocation, ISODate, Transaction } from "@/domain/types";

const strip = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};
const now = () => new Date().toISOString();

/* ---------------- Assets ---------------- */

export async function createAsset(
  input: AssetInput,
  value: number,
  date: ISODate,
  db: FinanceDB = getDb(),
): Promise<Asset> {
  assertValid([...validateAsset(input), ...validateValuation(value, date)]);
  const t = now();
  const asset: Asset = strip({
    id: newId(),
    ...input,
    name: input.name.trim(),
    notes: input.notes?.trim() || undefined,
    value,
    valuationDate: date,
    archived: false,
    createdAt: t,
    updatedAt: t,
  });
  await db.transaction("rw", db.assets, db.assetValuations, async () => {
    await db.assets.add(asset);
    await db.assetValuations.add({ id: newId(), assetId: asset.id, date, value, createdAt: t });
  });
  return asset;
}

/** Edits descriptive fields only; the value history is untouched. */
export async function updateAsset(id: string, input: AssetInput, db: FinanceDB = getDb()) {
  assertValid(validateAsset(input));
  await db.transaction("rw", db.assets, db.assetValuations, async () => {
    const cur = await db.assets.get(id);
    if (!cur) throw new ValidationError(["Bem não encontrado."]);
    if (input.currency !== cur.currency && (await db.assetValuations.where("assetId").equals(id).count()) > 1)
      throw new ValidationError(["Não é possível trocar a moeda de um bem com histórico de valores."]);
    await db.assets.put(
      strip({ ...cur, ...input, name: input.name.trim(), notes: input.notes?.trim() || undefined, updatedAt: now() }),
    );
  });
}

/** Appends a new estimate; older estimates and all transactions stay as they were. */
export async function addAssetValuation(
  assetId: string,
  value: number,
  date: ISODate,
  db: FinanceDB = getDb(),
) {
  assertValid(validateValuation(value, date));
  await db.transaction("rw", db.assets, db.assetValuations, async () => {
    const a = await db.assets.get(assetId);
    if (!a) throw new ValidationError(["Bem não encontrado."]);
    await db.assetValuations.add({ id: newId(), assetId, date, value, createdAt: now() });
    if (date >= a.valuationDate)
      await db.assets.update(assetId, { value, valuationDate: date, updatedAt: now() });
  });
}

export async function setAssetArchived(id: string, archived: boolean, db: FinanceDB = getDb()) {
  if (!(await db.assets.update(id, { archived, updatedAt: now() })))
    throw new ValidationError(["Bem não encontrado."]);
}

/** Assets are never referenced by transactions or goals; delete removes the asset and its value history together. */
export async function deleteAsset(id: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.assets, db.assetValuations, async () => {
    if (!(await db.assets.get(id))) throw new ValidationError(["Bem não encontrado."]);
    await db.assetValuations.where("assetId").equals(id).delete();
    await db.assets.delete(id);
  });
}

/* ---------------- Debts ---------------- */

export async function createDebt(
  input: DebtInput,
  balance: number,
  date: ISODate,
  proceeds?: { accountId: string } | undefined,
  db: FinanceDB = getDb(),
): Promise<Debt> {
  assertValid([...validateDebt(input), ...validateDebtBalance(balance, date)]);
  return db.transaction("rw", [db.debts, db.debtBalances, db.accounts, db.transactions], async () => {
    const t = now();
    const debt: Debt = strip({
      id: newId(),
      ...input,
      name: input.name.trim(),
      notes: input.notes?.trim() || undefined,
      openingBalance: balance,
      openingDate: date,
      status: "active" as const,
      createdAt: t,
      updatedAt: t,
    });
    if (proceeds) {
      const acc = await db.accounts.get(proceeds.accountId);
      if (!acc || acc.archived) throw new ValidationError(["Selecione uma conta ativa para a entrada."]);
      if (acc.currency !== input.currency)
        throw new ValidationError(["A conta da entrada precisa ter a mesma moeda da dívida."]);
      if (balance <= 0) throw new ValidationError(["Informe um valor maior que zero para registrar a entrada."]);
      const tx: Transaction = {
        id: newId(),
        type: "loan_proceeds",
        status: "confirmed",
        date,
        amount: balance,
        currency: acc.currency,
        accountId: acc.id,
        debtId: debt.id,
        description: `Entrada de ${debt.name}`,
        createdAt: t,
        updatedAt: t,
      };
      await db.transactions.add(tx);
      debt.proceedsTransactionId = tx.id;
    }
    await db.debts.add(debt);
    await db.debtBalances.add({ id: newId(), debtId: debt.id, date, balance, createdAt: t });
    return debt;
  });
}

export async function updateDebt(id: string, input: DebtInput, db: FinanceDB = getDb()) {
  assertValid(validateDebt(input));
  await db.transaction("rw", db.debts, db.transactions, async () => {
    const cur = await db.debts.get(id);
    if (!cur) throw new ValidationError(["Dívida não encontrada."]);
    if (input.currency !== cur.currency && (await db.transactions.where("debtId").equals(id).count()) > 0)
      throw new ValidationError(["Não é possível trocar a moeda de uma dívida com lançamentos."]);
    const next: Debt = { ...cur, ...input, name: input.name.trim(), notes: input.notes?.trim() || undefined, updatedAt: now() };
    if (input.interestRateBp === undefined) {
      delete next.interestRateBp;
      delete next.interestPeriod;
    }
    if (input.dueDay === undefined) delete next.dueDay;
    await db.debts.put(strip(next));
  });
}

/** Appends a manual balance; earlier balances and payments are preserved. */
export async function addDebtBalance(
  debtId: string,
  balance: number,
  date: ISODate,
  db: FinanceDB = getDb(),
) {
  assertValid(validateDebtBalance(balance, date));
  await db.transaction("rw", db.debts, db.debtBalances, async () => {
    const d = await db.debts.get(debtId);
    if (!d) throw new ValidationError(["Dívida não encontrada."]);
    await db.debtBalances.add({ id: newId(), debtId, date, balance, createdAt: now() });
    await db.debts.update(debtId, { updatedAt: now() });
  });
}

export interface PaymentInput {
  accountId: string;
  date: ISODate;
  amount: number;
  /** Omit when principal/interest are unknown: the payment stays pending. */
  split?: PaymentSplit | undefined;
  /** Client-generated id makes a double submit idempotent. */
  requestId: string;
}

export async function registerDebtPayment(
  debtId: string,
  p: PaymentInput,
  db: FinanceDB = getDb(),
): Promise<Transaction> {
  const errors: string[] = [];
  if (!Number.isSafeInteger(p.amount) || p.amount <= 0) errors.push("O valor pago precisa ser maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || Number.isNaN(Date.parse(p.date))) errors.push("Informe uma data válida.");
  if (p.split) errors.push(...validateSplit(p.amount, p.split));
  assertValid(errors);
  return db.transaction("rw", db.debts, db.accounts, db.transactions, async () => {
    const existing = await db.transactions.get(p.requestId);
    if (existing) {
      if (existing.debtId === debtId) return existing;
      throw new ValidationError(["Pagamento duplicado."]);
    }
    const debt = await db.debts.get(debtId);
    if (!debt) throw new ValidationError(["Dívida não encontrada."]);
    if (debt.status !== "active") throw new ValidationError(["Esta dívida não está ativa."]);
    const acc = await db.accounts.get(p.accountId);
    if (!acc || acc.archived) throw new ValidationError(["Selecione uma conta ativa."]);
    if (acc.currency !== debt.currency)
      throw new ValidationError(["A conta precisa ter a mesma moeda da dívida."]);
    const t = now();
    const tx: Transaction = strip({
      id: p.requestId,
      type: "debt_payment" as const,
      status: "confirmed" as const,
      date: p.date,
      amount: p.amount,
      currency: acc.currency,
      accountId: acc.id,
      debtId,
      description: `Pagamento de ${debt.name}`,
      allocation: p.split ? ("allocated" as const) : ("pending" as const),
      principalAmount: p.split?.principal,
      interestAmount: p.split?.interest,
      feesAmount: p.split?.fees,
      createdAt: t,
      updatedAt: t,
    });
    await db.transactions.add(tx);
    return tx;
  });
}

/** Classifies a pending payment once; amount and account never change here. */
export async function allocateDebtPayment(txId: string, split: PaymentSplit, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.transactions, async () => {
    const tx = await db.transactions.get(txId);
    if (!tx || tx.type !== "debt_payment") throw new ValidationError(["Pagamento não encontrado."]);
    if (tx.allocation !== "pending") throw new ValidationError(["Este pagamento já foi classificado."]);
    assertValid(validateSplit(tx.amount, split));
    await db.transactions.update(txId, {
      allocation: "allocated",
      principalAmount: split.principal,
      interestAmount: split.interest,
      feesAmount: split.fees,
      updatedAt: now(),
    });
  });
}

/** Marks as paid: records a zero balance and keeps every past row. */
export async function settleDebt(id: string, date: ISODate, db: FinanceDB = getDb()) {
  assertValid(validateDebtBalance(0, date));
  await db.transaction("rw", db.debts, db.debtBalances, async () => {
    const d = await db.debts.get(id);
    if (!d) throw new ValidationError(["Dívida não encontrada."]);
    if (d.status === "paid") throw new ValidationError(["A dívida já está quitada."]);
    await db.debtBalances.add({ id: newId(), debtId: id, date, balance: 0, note: "Quitação", createdAt: now() });
    await db.debts.update(id, { status: "paid", paidAt: date, updatedAt: now() });
  });
}

export async function reopenDebt(id: string, db: FinanceDB = getDb()) {
  if (!(await db.debts.update(id, { status: "active", paidAt: undefined, updatedAt: now() })))
    throw new ValidationError(["Dívida não encontrada."]);
}

/** Physical delete only for debts never used by a transaction. */
export async function deleteDebt(id: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.debts, db.debtBalances, db.transactions, async () => {
    if (!(await db.debts.get(id))) throw new ValidationError(["Dívida não encontrada."]);
    if ((await db.transactions.where("debtId").equals(id).count()) > 0)
      throw new ValidationError(["Esta dívida tem pagamentos ou entrada registrados. Marque como quitada em vez de excluir."]);
    await db.debtBalances.where("debtId").equals(id).delete();
    await db.debts.delete(id);
  });
}

export async function currentDebtStatus(id: string, db: FinanceDB = getDb()) {
  const d = await db.debts.get(id);
  if (!d) throw new ValidationError(["Dívida não encontrada."]);
  return debtStatus(
    d,
    await db.debtBalances.where("debtId").equals(id).toArray(),
    await db.transactions.where("debtId").equals(id).toArray(),
    todayISO(),
  );
}

/* ---------------- Goals ---------------- */

export async function createGoal(input: GoalInput, db: FinanceDB = getDb()): Promise<Goal> {
  assertValid(validateGoal(input));
  const t = now();
  const g: Goal = strip({
    id: newId(),
    ...input,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    mode: "manual" as const,
    linkedAccountIds: [],
    status: "active" as const,
    createdAt: t,
    updatedAt: t,
  });
  await db.goals.add(g);
  return g;
}

export async function updateGoal(id: string, input: GoalInput, db: FinanceDB = getDb()) {
  assertValid(validateGoal(input));
  await db.transaction("rw", db.goals, db.goalAllocations, async () => {
    const cur = await db.goals.get(id);
    if (!cur) throw new ValidationError(["Meta não encontrada."]);
    if (input.currency !== cur.currency && (await db.goalAllocations.where("goalId").equals(id).count()) > 0)
      throw new ValidationError(["Não é possível trocar a moeda de uma meta com contribuições."]);
    const next: Goal = { ...cur, ...input, name: input.name.trim(), description: input.description?.trim() || undefined, updatedAt: now() };
    if (!input.targetDate) delete next.targetDate;
    await db.goals.put(strip(next));
  });
}

export async function setGoalStatus(id: string, status: Goal["status"], db: FinanceDB = getDb()) {
  if (!["active", "achieved", "archived"].includes(status)) throw new ValidationError(["Situação inválida."]);
  if (!(await db.goals.update(id, { status, updatedAt: now() })))
    throw new ValidationError(["Meta não encontrada."]);
}

/** Deletes the goal and its earmarks together; no account or transaction is touched. */
export async function deleteGoal(id: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.goals, db.goalAllocations, async () => {
    if (!(await db.goals.get(id))) throw new ValidationError(["Meta não encontrada."]);
    await db.goalAllocations.where("goalId").equals(id).delete();
    await db.goals.delete(id);
  });
}

export interface AllocationInput {
  date: ISODate;
  amount: number;
  note?: string | undefined;
}

/**
 * A contribution is an earmark of money already in accounts, not income or a new asset.
 * Total earmarks per currency cannot exceed positive actual account balances.
 */
async function saveAllocation(goalId: string, input: AllocationInput, id: string | null, db: FinanceDB) {
  assertValid(validateAllocation(input.amount, input.date));
  await db.transaction("rw", [db.goals, db.goalAllocations, db.accounts, db.transactions], async () => {
    const goal = await db.goals.get(goalId);
    if (!goal) throw new ValidationError(["Meta não encontrada."]);
    if (goal.status === "archived") throw new ValidationError(["Reative a meta antes de registrar contribuições."]);
    const prev = id ? await db.goalAllocations.get(id) : undefined;
    if (id && (!prev || prev.goalId !== goalId)) throw new ValidationError(["Contribuição não encontrada."]);
    const [accounts, txs, goals, all] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.goals.toArray(),
      db.goalAllocations.toArray(),
    ]);
    const others = all.filter((a) => a.id !== id);
    const goalSum = others.filter((a) => a.goalId === goalId).reduce((s, a) => s + a.amount, 0);
    if (goalSum + input.amount < 0)
      throw new ValidationError(["A retirada é maior que o valor reservado na meta."]);
    const balances = computeBalances(accounts, txs, todayISO());
    const cap = allocationCapacity(goal.currency, accounts, balances, goals, [
      ...others,
      { id: "new", goalId, date: input.date, amount: input.amount, createdAt: "", updatedAt: "" },
    ]);
    if (input.amount > 0 && cap.free < 0)
      throw new ValidationError([
        "O total reservado em metas passaria do dinheiro disponível nas contas. O mesmo dinheiro não pode ser contado duas vezes.",
      ]);
    const t = now();
    const row: GoalAllocation = strip({
      id: id ?? newId(),
      goalId,
      date: input.date,
      amount: input.amount,
      note: input.note?.trim() || undefined,
      createdAt: prev?.createdAt ?? t,
      updatedAt: t,
    });
    await db.goalAllocations.put(row);
  });
}

export const addGoalAllocation = (goalId: string, input: AllocationInput, db: FinanceDB = getDb()) =>
  saveAllocation(goalId, input, null, db);
export const updateGoalAllocation = (
  goalId: string,
  id: string,
  input: AllocationInput,
  db: FinanceDB = getDb(),
) => saveAllocation(goalId, input, id, db);

export async function deleteGoalAllocation(id: string, db: FinanceDB = getDb()) {
  if (!(await db.goalAllocations.get(id))) throw new ValidationError(["Contribuição não encontrada."]);
  await db.goalAllocations.delete(id);
}

/** Read-only snapshot for the Phase 5 screens. */
export async function readWealth(db: FinanceDB = getDb()) {
  return db.transaction(
    "r",
    [db.accounts, db.transactions, db.assets, db.assetValuations, db.debts, db.debtBalances, db.goals, db.goalAllocations, db.settings],
    async () => {
      const [accounts, transactions, assets, valuations, debts, debtBalances, goals, allocations, settings] =
        await Promise.all([
          db.accounts.toArray(),
          db.transactions.toArray(),
          db.assets.toArray(),
          db.assetValuations.toArray(),
          db.debts.toArray(),
          db.debtBalances.toArray(),
          db.goals.toArray(),
          db.goalAllocations.toArray(),
          db.settings.get("app"),
        ]);
      const today = todayISO();
      return {
        today,
        accounts,
        transactions,
        balances: computeBalances(accounts, transactions, today),
        assets,
        valuations,
        debts,
        debtBalances,
        goals,
        allocations,
        locale: settings?.locale ?? "pt-BR",
        currency: settings?.displayCurrency ?? "BRL",
      };
    },
  );
}
