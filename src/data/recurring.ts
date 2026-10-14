import { getDb, newId, type FinanceDB } from "./db";
import { assertValid, ValidationError } from "@/domain/errors";
import { isCategoryCompatible } from "@/domain/categories";
import { isISODate, type RecurringOccurrence } from "@/domain/recurring";
import type { Frequency, RecurringRule, Transaction, TransactionStatus } from "@/domain/types";

export interface RecurringRuleDraft {
  name: string;
  type: "income" | "expense";
  amount: number;
  accountId: string;
  categoryId: string;
  startDate: string;
  frequency: Frequency;
  dayOfMonth?: number | undefined;
  endDate?: string | undefined;
  notes?: string | undefined;
}

async function validatedRule(
  draft: RecurringRuleDraft,
  db: FinanceDB,
  previous?: RecurringRule,
): Promise<Omit<RecurringRule, "id" | "createdAt" | "updatedAt" | "active" | "endedAt">> {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push("Informe a descrição.");
  if (name.length > 120) errors.push("A descrição pode ter no máximo 120 caracteres.");
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0)
    errors.push("O valor precisa ser maior que zero.");
  if (!isISODate(draft.startDate)) errors.push("Informe uma data de início válida.");
  if (draft.endDate && !isISODate(draft.endDate))
    errors.push("Informe uma data de término válida.");
  if (draft.endDate && draft.endDate < draft.startDate)
    errors.push("A data de término não pode ser anterior ao início.");
  if (!["weekly", "biweekly", "monthly", "yearly"].includes(draft.frequency))
    errors.push("Frequência inválida.");
  if (
    (draft.frequency === "monthly" || draft.frequency === "yearly") &&
    (!Number.isInteger(draft.dayOfMonth) ||
      (draft.dayOfMonth ?? 0) < 1 ||
      (draft.dayOfMonth ?? 0) > 31)
  )
    errors.push("O dia de vencimento precisa estar entre 1 e 31.");
  const [account, category] = await Promise.all([
    db.accounts.get(draft.accountId),
    db.categories.get(draft.categoryId),
  ]);
  if (!account) errors.push("Selecione uma conta.");
  else if (account.archived && previous?.accountId !== account.id)
    errors.push(`A conta "${account.name}" está arquivada.`);
  if (!category) errors.push("Selecione uma categoria.");
  else {
    if (!isCategoryCompatible(draft.type, category.kind))
      errors.push("Essa categoria não combina com o tipo da recorrência.");
    if (category.archived && previous?.categoryId !== category.id)
      errors.push(`A categoria "${category.name}" está arquivada.`);
  }
  assertValid(errors);
  return {
    name,
    type: draft.type,
    amount: draft.amount,
    currency: account?.currency ?? "BRL",
    accountId: draft.accountId,
    categoryId: draft.categoryId,
    frequency: draft.frequency,
    interval: 1,
    weekday:
      draft.frequency === "weekly" || draft.frequency === "biweekly"
        ? new Date(`${draft.startDate}T00:00:00Z`).getUTCDay()
        : undefined,
    dayOfMonth:
      draft.frequency === "monthly" || draft.frequency === "yearly" ? draft.dayOfMonth : undefined,
    startDate: draft.startDate,
    endDate: draft.endDate || undefined,
    notes: draft.notes?.trim() || undefined,
  };
}

export async function createRecurringRule(
  draft: RecurringRuleDraft,
  db: FinanceDB = getDb(),
): Promise<RecurringRule> {
  return db.transaction("rw", db.accounts, db.categories, db.recurringRules, async () => {
    const clean = await validatedRule(draft, db);
    const now = new Date().toISOString();
    const rule: RecurringRule = {
      id: newId(),
      ...clean,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.recurringRules.add(rule);
    return rule;
  });
}

export async function updateRecurringRule(
  id: string,
  draft: RecurringRuleDraft,
  db: FinanceDB = getDb(),
): Promise<RecurringRule> {
  return db.transaction("rw", db.accounts, db.categories, db.recurringRules, async () => {
    const previous = await db.recurringRules.get(id);
    if (!previous) throw new ValidationError(["Recorrência não encontrada."]);
    if (previous.endedAt)
      throw new ValidationError(["Uma recorrência encerrada não pode ser alterada."]);
    const clean = await validatedRule(draft, db, previous);
    const next: RecurringRule = { ...previous, ...clean, updatedAt: new Date().toISOString() };
    await db.recurringRules.put(next);
    return next;
  });
}

export async function setRecurringRuleActive(id: string, active: boolean, db: FinanceDB = getDb()) {
  const rule = await db.recurringRules.get(id);
  if (!rule) throw new ValidationError(["Recorrência não encontrada."]);
  if (rule.endedAt) throw new ValidationError(["Uma recorrência encerrada não pode ser retomada."]);
  await db.recurringRules.update(id, { active, updatedAt: new Date().toISOString() });
}

export async function endRecurringRule(id: string, endDate: string, db: FinanceDB = getDb()) {
  if (!isISODate(endDate)) throw new ValidationError(["Data de encerramento inválida."]);
  const rule = await db.recurringRules.get(id);
  if (!rule) throw new ValidationError(["Recorrência não encontrada."]);
  await db.recurringRules.update(id, {
    active: false,
    endDate: endDate < rule.startDate ? rule.startDate : endDate,
    endedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/** Store an occurrence only when it is confirmed or explicitly edited. */
export async function saveOccurrence(
  occurrence: RecurringOccurrence,
  status: TransactionStatus,
  db: FinanceDB = getDb(),
): Promise<Transaction> {
  return db.transaction("rw", db.transactions, async () => {
    const existing = await db.transactions
      .where("[recurringRuleId+occurrenceDate]")
      .equals([occurrence.recurringRuleId, occurrence.occurrenceDate])
      .first();
    if (existing) {
      const next = { ...existing, status, updatedAt: new Date().toISOString() };
      await db.transactions.put(next);
      return next;
    }
    const now = new Date().toISOString();
    const tx: Transaction = {
      id: newId(),
      type: occurrence.type,
      status,
      date: occurrence.date,
      amount: occurrence.amount,
      currency: occurrence.currency,
      accountId: occurrence.accountId,
      categoryId: occurrence.categoryId,
      description: occurrence.description,
      notes: occurrence.notes,
      recurringRuleId: occurrence.recurringRuleId,
      occurrenceDate: occurrence.occurrenceDate,
      createdAt: now,
      updatedAt: now,
    };
    await db.transactions.add(tx);
    return tx;
  });
}
