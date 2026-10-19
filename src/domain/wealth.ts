import type {
  Account,
  Asset,
  AssetType,
  AssetValuation,
  Debt,
  DebtBalance,
  DebtType,
  Goal,
  GoalAllocation,
  ISODate,
  Transaction,
} from "./types";
import { effectiveState } from "./dates";
import { addCents, type Cents, type CurrencyCode } from "./money";

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  real_estate: "Imóvel",
  vehicle: "Veículo",
  business: "Empresa / participação",
  receivable: "Valor a receber",
  collectible: "Bem de coleção",
  other_investment: "Outro investimento",
  other: "Outro bem",
};

export const DEBT_TYPE_LABEL: Record<DebtType, string> = {
  loan: "Empréstimo",
  financing: "Financiamento",
  overdraft: "Cheque especial (fora de conta)",
  personal: "Dívida pessoal",
  other: "Outra",
};

export const GOAL_TYPE_LABEL: Record<Goal["goalType"], string> = {
  emergency_fund: "Reserva de emergência",
  purchase: "Compra",
  travel: "Viagem",
  home: "Casa",
  debt_payoff: "Quitar dívida",
  independence: "Formação de patrimônio",
  custom: "Outra",
};

export const isISODate = (d: unknown): d is ISODate =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(d)) &&
  new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

const validName = (name: string, errors: string[]) => {
  if (!name?.trim()) errors.push("Informe o nome.");
  else if (name.trim().length > 80) errors.push("O nome pode ter no máximo 80 caracteres.");
};
const validCurrency = (c: string, errors: string[]) => {
  if (!/^[A-Z]{3}$/.test(c ?? "")) errors.push("Moeda inválida.");
};

/* ---------------- Assets ---------------- */

export interface AssetInput {
  name: string;
  assetType: AssetType;
  currency: CurrencyCode;
  notes?: string | undefined;
  /** True when the value is already inside an account balance (shown, never summed again). */
  countedInAccounts: boolean;
}

export function validateAsset(input: AssetInput): string[] {
  const e: string[] = [];
  validName(input.name, e);
  if (!(input.assetType in ASSET_TYPE_LABEL)) e.push("Tipo de bem inválido.");
  validCurrency(input.currency, e);
  return e;
}

export function validateValuation(value: Cents, date: ISODate): string[] {
  const e: string[] = [];
  if (!Number.isSafeInteger(value) || value < 0)
    e.push("O valor estimado precisa ser zero ou maior.");
  if (!isISODate(date)) e.push("Informe uma data de referência válida.");
  return e;
}

/** Latest record by reference date, then by creation time. */
export function latest<T extends { date: ISODate; createdAt: string }>(rows: T[]): T | undefined {
  return [...rows].sort((a, b) =>
    a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
  ).at(-1);
}

export function currentAssetValue(valuations: AssetValuation[]): AssetValuation | undefined {
  return latest(valuations);
}

/* ---------------- Debts ---------------- */

export interface DebtInput {
  name: string;
  debtType: DebtType;
  currency: CurrencyCode;
  /** Interest in basis points per period (199 = 1,99%). */
  interestRateBp?: number | undefined;
  interestPeriod?: "monthly" | "yearly" | undefined;
  dueDay?: number | undefined;
  notes?: string | undefined;
}

export function validateDebt(input: DebtInput): string[] {
  const e: string[] = [];
  validName(input.name, e);
  if (!(input.debtType in DEBT_TYPE_LABEL)) e.push("Tipo de dívida inválido.");
  validCurrency(input.currency, e);
  if (input.interestRateBp !== undefined) {
    if (!Number.isSafeInteger(input.interestRateBp) || input.interestRateBp < 0)
      e.push("Taxa de juros inválida.");
    if (!input.interestPeriod) e.push("Informe a periodicidade dos juros.");
  }
  if (
    input.dueDay !== undefined &&
    (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)
  )
    e.push("Dia de vencimento deve estar entre 1 e 31.");
  return e;
}

export function validateDebtBalance(balance: Cents, date: ISODate): string[] {
  const e: string[] = [];
  if (!Number.isSafeInteger(balance) || balance < 0)
    e.push("O saldo devedor precisa ser zero ou maior.");
  if (!isISODate(date)) e.push("Informe uma data de referência válida.");
  return e;
}

export interface PaymentSplit {
  principal: Cents;
  interest: Cents;
  fees: Cents;
}

export function validateSplit(amount: Cents, s: PaymentSplit): string[] {
  const parts = [s.principal, s.interest, s.fees];
  if (parts.some((p) => !Number.isSafeInteger(p) || p < 0))
    return ["Principal, juros e encargos precisam ser zero ou maiores."];
  if (addCents(...parts) !== amount)
    return ["Principal + juros + encargos precisa ser igual ao valor pago."];
  return [];
}

export interface DebtStatus {
  /** Latest manual balance (reference) minus allocated principal paid after it. */
  balance: Cents;
  referenceDate: ISODate;
  /** Paid but not yet split into principal/interest: never reduces the balance. */
  pending: Cents;
}

/**
 * Manual balance snapshots are the source of truth; payments made AFTER the
 * latest snapshot reduce it only by their allocated principal. Payments with
 * unknown split stay pending and do not touch the balance.
 */
export function debtStatus(
  debt: Debt,
  snapshots: DebtBalance[],
  txs: Transaction[],
  today: ISODate,
): DebtStatus {
  const snap = latest(snapshots.filter((s) => s.debtId === debt.id));
  const referenceDate = snap?.date ?? debt.openingDate;
  let balance = snap?.balance ?? debt.openingBalance;
  let pending = 0;
  for (const t of txs) {
    if (t.debtId !== debt.id || t.type !== "debt_payment") continue;
    if (effectiveState(t, today) !== "actual") continue;
    if (t.allocation === "pending") pending = addCents(pending, t.amount);
    else if (t.date > referenceDate) balance = addCents(balance, -(t.principalAmount ?? 0));
  }
  return { balance: Math.max(0, balance), referenceDate, pending };
}

/* ---------------- Net worth ---------------- */

export interface NetWorth {
  currency: CurrencyCode;
  accountsPositive: Cents;
  /** Negative account balances (credit cards, overdraft): counted once, here. */
  accountsNegative: Cents;
  assets: Cents;
  /** Assets flagged as already inside an account: shown, never summed. */
  assetsExcluded: Cents;
  pendingPayments: Cents;
  debts: Cents;
  totalAssets: Cents;
  totalLiabilities: Cents;
  netWorth: Cents;
  lastUpdated: ISODate | null;
}

export interface NetWorthInput {
  accounts: Account[];
  balances: Record<string, Cents>;
  assets: Asset[];
  valuations: AssetValuation[];
  debts: Debt[];
  debtBalances: DebtBalance[];
  transactions: Transaction[];
  today: ISODate;
}

/**
 * Net worth per currency (never converted):
 *   positive account balances + non-duplicated assets + pending debt payments
 *   − |negative account balances| − active debt balances.
 * Goal allocations are earmarks of existing money and are never added.
 */
export function netWorthByCurrency(i: NetWorthInput): Record<CurrencyCode, NetWorth> {
  const out: Record<CurrencyCode, NetWorth> = {};
  const get = (c: CurrencyCode) =>
    (out[c] ??= {
      currency: c,
      accountsPositive: 0,
      accountsNegative: 0,
      assets: 0,
      assetsExcluded: 0,
      pendingPayments: 0,
      debts: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      netWorth: 0,
      lastUpdated: null,
    });
  const touch = (n: NetWorth, d: ISODate) => {
    if (!n.lastUpdated || d > n.lastUpdated) n.lastUpdated = d;
  };
  for (const a of i.accounts) {
    if (a.archived) continue;
    const n = get(a.currency);
    const b = i.balances[a.id] ?? 0;
    if (b >= 0) n.accountsPositive = addCents(n.accountsPositive, b);
    else n.accountsNegative = addCents(n.accountsNegative, -b);
  }
  for (const t of i.transactions)
    if (t.type !== "transfer" && effectiveState(t, i.today) === "actual") {
      const acc = i.accounts.find((a) => a.id === t.accountId);
      if (acc && !acc.archived) touch(get(acc.currency), t.date);
    }
  for (const a of i.assets) {
    if (a.archived) continue;
    const v = currentAssetValue(i.valuations.filter((x) => x.assetId === a.id));
    if (!v) continue;
    const n = get(a.currency);
    if (a.countedInAccounts) n.assetsExcluded = addCents(n.assetsExcluded, v.value);
    else n.assets = addCents(n.assets, v.value);
    touch(n, v.date);
  }
  for (const d of i.debts) {
    const s = debtStatus(d, i.debtBalances, i.transactions, i.today);
    const n = get(d.currency);
    n.pendingPayments = addCents(n.pendingPayments, s.pending);
    if (d.status !== "active") continue;
    n.debts = addCents(n.debts, s.balance);
    touch(n, s.referenceDate);
  }
  for (const n of Object.values(out)) {
    n.totalAssets = addCents(n.accountsPositive, n.assets, n.pendingPayments);
    n.totalLiabilities = addCents(n.accountsNegative, n.debts);
    n.netWorth = addCents(n.totalAssets, -n.totalLiabilities);
  }
  return out;
}

/* ---------------- Goals ---------------- */

export interface GoalInput {
  name: string;
  description?: string | undefined;
  goalType: Goal["goalType"];
  currency: CurrencyCode;
  target: Cents;
  targetDate?: ISODate | undefined;
}

export function validateGoal(input: GoalInput): string[] {
  const e: string[] = [];
  validName(input.name, e);
  if (!(input.goalType in GOAL_TYPE_LABEL)) e.push("Tipo de meta inválido.");
  validCurrency(input.currency, e);
  if (!Number.isSafeInteger(input.target) || input.target <= 0)
    e.push("O valor-alvo precisa ser maior que zero.");
  if (input.targetDate !== undefined && !isISODate(input.targetDate))
    e.push("Data-alvo inválida.");
  return e;
}

export function validateAllocation(amount: Cents, date: ISODate): string[] {
  const e: string[] = [];
  if (!Number.isSafeInteger(amount) || amount === 0)
    e.push("Informe um valor diferente de zero (negativo para retirar).");
  if (!isISODate(date)) e.push("Informe uma data válida.");
  return e;
}

export interface GoalProgress {
  saved: Cents;
  /** 0–100, never above 100. */
  percent: number;
  remaining: Cents;
  surplus: Cents;
  reached: boolean;
}

export function goalProgress(goal: Goal, allocations: GoalAllocation[]): GoalProgress {
  const saved = Math.max(
    0,
    addCents(...allocations.filter((a) => a.goalId === goal.id).map((a) => a.amount)),
  );
  const percent = Math.min(100, Math.floor((saved * 100) / goal.target));
  return {
    saved,
    percent,
    remaining: Math.max(0, goal.target - saved),
    surplus: Math.max(0, saved - goal.target),
    reached: saved >= goal.target,
  };
}

/**
 * Money that can still be earmarked in a currency: positive account balances
 * minus what non-archived goals already reserve. Prevents counting the same
 * money twice across goals.
 */
export function allocationCapacity(
  currency: CurrencyCode,
  accounts: Account[],
  balances: Record<string, Cents>,
  goals: Goal[],
  allocations: GoalAllocation[],
): { available: Cents; allocated: Cents; free: Cents } {
  let available = 0;
  for (const a of accounts)
    if (!a.archived && a.currency === currency && (balances[a.id] ?? 0) > 0)
      available = addCents(available, balances[a.id] ?? 0);
  let allocated = 0;
  for (const g of goals) {
    if (g.currency !== currency || g.status === "archived") continue;
    allocated = addCents(allocated, goalProgress(g, allocations).saved);
  }
  return { available, allocated, free: available - allocated };
}
