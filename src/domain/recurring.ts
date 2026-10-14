import type { ISODate, RecurringRule, Transaction } from "./types";

export const FREQUENCY_LABEL = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  yearly: "Anual",
} as const;

const DAY_MS = 86_400_000;

function utc(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isISODate(value: string): value is ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return iso(utc(value)) === value;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthCandidate(year: number, month: number, day: number): ISODate {
  return iso(new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month)))));
}

/** Calendar dates for one rule in an inclusive, caller-bounded window. */
export function occurrenceDates(
  rule: Pick<RecurringRule, "startDate" | "endDate" | "frequency" | "interval" | "dayOfMonth">,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  if (!isISODate(from) || !isISODate(to) || from > to || !isISODate(rule.startDate)) return [];
  const lower = from > rule.startDate ? from : rule.startDate;
  const upper = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (lower > upper) return [];
  const out: ISODate[] = [];
  const start = utc(rule.startDate);

  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const baseDays = rule.frequency === "biweekly" ? 14 : 7;
    const step = baseDays * Math.max(1, rule.interval);
    const lowerDiff = Math.max(0, Math.floor((utc(lower).getTime() - start.getTime()) / DAY_MS));
    let offset = Math.ceil(lowerDiff / step) * step;
    while (true) {
      const candidate = iso(new Date(start.getTime() + offset * DAY_MS));
      if (candidate > upper) break;
      out.push(candidate);
      offset += step;
    }
    return out;
  }

  const day = rule.dayOfMonth ?? start.getUTCDate();
  if (rule.frequency === "monthly") {
    const interval = Math.max(1, rule.interval);
    let index = 0;
    while (true) {
      const monthIndex = start.getUTCMonth() + index * interval;
      const candidate = monthCandidate(
        start.getUTCFullYear() + Math.floor(monthIndex / 12),
        ((monthIndex % 12) + 12) % 12,
        day,
      );
      if (candidate > upper) break;
      if (candidate >= lower && candidate >= rule.startDate) out.push(candidate);
      index += 1;
    }
    return out;
  }

  const interval = Math.max(1, rule.interval);
  let year = start.getUTCFullYear();
  while (true) {
    const candidate = monthCandidate(year, start.getUTCMonth(), day);
    if (candidate > upper) break;
    if (candidate >= lower && candidate >= rule.startDate) out.push(candidate);
    year += interval;
  }
  return out;
}

export interface RecurringOccurrence {
  recurringRuleId: string;
  occurrenceDate: ISODate;
  date: ISODate;
  type: "income" | "expense";
  amount: number;
  currency: string;
  accountId: string;
  categoryId: string;
  description: string;
  notes?: string;
  transaction?: Transaction;
}

/** Merge calculated forecasts with individually edited/confirmed stored rows. */
export function projectOccurrences(
  rules: RecurringRule[],
  transactions: Transaction[],
  skipped: Array<{ recurringRuleId: string; occurrenceDate: ISODate }>,
  from: ISODate,
  to: ISODate,
): RecurringOccurrence[] {
  const stored = new Map(
    transactions
      .filter((tx) => tx.recurringRuleId && tx.occurrenceDate)
      .map((tx) => [`${tx.recurringRuleId}:${tx.occurrenceDate}`, tx]),
  );
  const skippedKeys = new Set(skipped.map((s) => `${s.recurringRuleId}:${s.occurrenceDate}`));
  const out: RecurringOccurrence[] = [];
  for (const rule of rules) {
    for (const occurrenceDate of occurrenceDates(rule, from, to)) {
      const key = `${rule.id}:${occurrenceDate}`;
      if (skippedKeys.has(key)) continue;
      const tx = stored.get(key);
      out.push({
        recurringRuleId: rule.id,
        occurrenceDate,
        date: tx?.date ?? occurrenceDate,
        type: rule.type,
        amount: tx?.amount ?? rule.amount,
        currency: tx?.currency ?? rule.currency,
        accountId: tx?.accountId ?? rule.accountId,
        categoryId: tx?.categoryId ?? rule.categoryId ?? "",
        description: tx?.description ?? rule.name,
        notes: tx?.notes ?? rule.notes,
        transaction: tx,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}