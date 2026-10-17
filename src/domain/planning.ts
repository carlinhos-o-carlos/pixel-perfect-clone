import { effectiveState, type EffectiveState } from "./dates";
import { addCents } from "./money";
import { isISODate, projectOccurrences, shiftDays } from "./recurring";
import { accountEffects } from "./transactions";
import type { Account, Budget, Category, RecurringRule, SkippedOccurrence, Transaction } from "./types";

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isISODate(`${month}-01`)) return null;
  const from = `${month}-01`;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from, to: shiftDays(d.toISOString().slice(0, 10), -1) };
}

export function adjacentMonth(month: string, delta: number): string {
  const bounds = monthBounds(month);
  if (!bounds) return month;
  const d = new Date(`${bounds.from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/** Stored rows are authoritative. Only unsaved occurrences become virtual rows. */
export function planningTransactions(
  transactions: Transaction[], rules: RecurringRule[], skipped: SkippedOccurrence[],
  from: string, to: string,
): Transaction[] {
  const virtual = projectOccurrences(rules, transactions, skipped, from, to)
    .filter((o) => !o.transaction && o.date >= from && o.date <= to)
    .map((o): Transaction => ({
      id: `forecast:${o.recurringRuleId}:${o.occurrenceDate}`,
      recurringRuleId: o.recurringRuleId, occurrenceDate: o.occurrenceDate,
      type: o.type, status: "planned", date: o.date, amount: o.amount,
      currency: o.currency, accountId: o.accountId, categoryId: o.categoryId,
      description: o.description, createdAt: "", updatedAt: "",
    }));
  return [...transactions, ...virtual];
}

export interface PeriodTotals {
  actual: { income: number; expense: number };
  scheduled: { income: number; expense: number };
  planned: { income: number; expense: number };
  expected: { income: number; expense: number };
}
export function periodTotals(txs: Transaction[], from: string, to: string, today: string, currency: string): PeriodTotals {
  const out: PeriodTotals = {
    actual: { income: 0, expense: 0 }, scheduled: { income: 0, expense: 0 },
    planned: { income: 0, expense: 0 }, expected: { income: 0, expense: 0 },
  };
  for (const tx of txs) {
    if (tx.date < from || tx.date > to || tx.currency !== currency || (tx.type !== "income" && tx.type !== "expense")) continue;
    const state = effectiveState(tx, today);
    out[state][tx.type] = addCents(out[state][tx.type], tx.amount);
    out.expected[tx.type] = addCents(out.expected[tx.type], tx.amount);
  }
  return out;
}

export function categoryExpenses(txs: Transaction[], from: string, to: string, today: string, currency: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.type !== "expense" || !tx.categoryId || tx.currency !== currency || tx.date < from || tx.date > to || effectiveState(tx, today) !== "actual") continue;
    out[tx.categoryId] = addCents(out[tx.categoryId] ?? 0, tx.amount);
  }
  return out;
}

export interface BudgetUsage {
  budget: Budget; used: number; remaining: number; percent: number;
  state: "normal" | "near" | "limit" | "over";
}
export function budgetUsage(budgets: Budget[], txs: Transaction[], month: string, today: string, currency: string): BudgetUsage[] {
  const bounds = monthBounds(month);
  if (!bounds) return [];
  const expenses = categoryExpenses(txs, bounds.from, bounds.to, today, currency);
  return budgets.filter((b) => b.month === month && b.currency === currency).map((budget) => {
    const used = expenses[budget.categoryId] ?? 0;
    const percent = Number((BigInt(used) * 100n) / BigInt(budget.amount));
    return { budget, used, remaining: addCents(budget.amount, -used), percent,
      state: used > budget.amount ? "over" : used === budget.amount ? "limit" : percent >= 80 ? "near" : "normal" };
  });
}

export function validateBudget(d: Pick<Budget, "categoryId" | "month" | "currency" | "amount">, categories: Category[], previous?: Budget): string[] {
  const errors: string[] = [];
  if (!monthBounds(d.month)) errors.push("Selecione um mês válido.");
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0) errors.push("O limite precisa ser maior que zero.");
  if (!/^[A-Z]{3}$/.test(d.currency)) errors.push("Moeda inválida.");
  const cat = categories.find((c) => c.id === d.categoryId);
  if (!cat || cat.kind !== "expense") errors.push("Selecione uma categoria de despesa.");
  else if (cat.archived && previous?.categoryId !== cat.id) errors.push("Esta categoria está arquivada.");
  return errors;
}

export interface CashDay {
  date: string;
  actual: number; scheduled: number; planned: number;
  income: number; expense: number; transfers: number; other: number;
  actualBalance: number; projectedBalance: number;
  states: EffectiveState[];
}
export interface CashFlow {
  opening: number; projectedOpening: number; actualClosing: number; projectedClosing: number;
  income: number; expense: number; transfers: number; other: number; days: CashDay[];
}
/** Consolidation sums account effects, so internal transfers cancel exactly. */
export function cashFlow(accounts: Account[], txs: Transaction[], from: string, to: string, today: string, currency: string, accountId = ""): CashFlow {
  const selected = accounts.filter((a) => a.currency === currency && (accountId ? a.id === accountId : !a.archived));
  const ids = new Set(selected.map((a) => a.id));
  let opening = addCents(...selected.map((a) => a.openingBalance));
  let projectedOpening = opening;
  const byDate = new Map<string, CashDay>();
  for (const tx of txs) {
    if (tx.currency !== currency || tx.date > to) continue;
    const effects = accountEffects(tx).filter(([id]) => ids.has(id));
    if (!effects.length) continue;
    const delta = addCents(...effects.map(([, value]) => value));
    const state = effectiveState(tx, today);
    if (tx.date < from) {
      projectedOpening = addCents(projectedOpening, delta);
      if (state === "actual") opening = addCents(opening, delta);
      continue;
    }
    const day = byDate.get(tx.date) ?? {
      date: tx.date, actual: 0, scheduled: 0, planned: 0, income: 0, expense: 0,
      transfers: 0, other: 0, actualBalance: 0, projectedBalance: 0, states: [],
    };
    day[state] = addCents(day[state], delta);
    if (!day.states.includes(state)) day.states.push(state);
    if (tx.type === "income") day.income = addCents(day.income, tx.amount);
    else if (tx.type === "expense") day.expense = addCents(day.expense, tx.amount);
    else if (tx.type === "transfer") day.transfers = addCents(day.transfers, delta);
    else day.other = addCents(day.other, delta);
    byDate.set(tx.date, day);
  }
  let actualClosing = opening;
  let projectedClosing = projectedOpening;
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of days) {
    actualClosing = addCents(actualClosing, day.actual);
    projectedClosing = addCents(projectedClosing, day.actual, day.scheduled, day.planned);
    day.actualBalance = actualClosing;
    day.projectedBalance = projectedClosing;
  }
  return { opening, projectedOpening, actualClosing, projectedClosing, days,
    income: addCents(...days.map((d) => d.income)), expense: addCents(...days.map((d) => d.expense)),
    transfers: addCents(...days.map((d) => d.transfers)), other: addCents(...days.map((d) => d.other)) };
}