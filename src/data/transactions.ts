import { getDb, newId, type FinanceDB } from "./db";
import { assertValid, ValidationError } from "@/domain/errors";
import { validateTransaction, type TransactionDraft } from "@/domain/transactions";
import type { Transaction } from "@/domain/types";

function clean(d: TransactionDraft): TransactionDraft {
  return {
    ...d,
    description: d.description.trim(),
    notes: d.notes?.trim() || undefined,
    categoryId: d.categoryId || undefined,
    destinationAccountId: d.type === "transfer" ? d.destinationAccountId || undefined : undefined,
  };
}

/** A transfer is stored as ONE row with source and destination, never two rows. */
export async function createTransaction(
  draft: TransactionDraft,
  db: FinanceDB = getDb(),
): Promise<Transaction> {
  const d = clean(draft);
  return db.transaction("rw", db.accounts, db.categories, db.transactions, async () => {
    const [accounts, categories] = await Promise.all([db.accounts.toArray(), db.categories.toArray()]);
    assertValid(validateTransaction(d, accounts, categories));
    const currency = accounts.find((a) => a.id === d.accountId)!.currency;
    const now = new Date().toISOString();
    const tx: Transaction = { id: newId(), ...d, currency, createdAt: now, updatedAt: now };
    await db.transactions.add(tx);
    return tx;
  });
}

export async function updateTransaction(
  id: string,
  draft: TransactionDraft,
  db: FinanceDB = getDb(),
): Promise<Transaction> {
  const d = clean(draft);
  return db.transaction("rw", db.accounts, db.categories, db.transactions, async () => {
    const prev = await db.transactions.get(id);
    if (!prev) throw new ValidationError(["Lançamento não encontrado."]);
    if (prev.type !== "income" && prev.type !== "expense" && prev.type !== "transfer")
      throw new ValidationError(["Este tipo de lançamento ainda não pode ser editado aqui."]);
    const [accounts, categories] = await Promise.all([db.accounts.toArray(), db.categories.toArray()]);
    assertValid(validateTransaction(d, accounts, categories, prev));
    const currency = accounts.find((a) => a.id === d.accountId)!.currency;
    // Rebuild from the draft so fields dropped by a type change (e.g. destination) disappear.
    const next: Transaction = {
      id: prev.id,
      createdAt: prev.createdAt,
      recurringRuleId: prev.recurringRuleId,
      occurrenceDate: prev.occurrenceDate,
      ...d,
      currency,
      updatedAt: new Date().toISOString(),
    };
    await db.transactions.put(next);
    return next;
  });
}

/** Removing the single row reverses its effect on every account atomically. */
export async function deleteTransaction(id: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.transactions, async () => {
    if (!(await db.transactions.get(id))) throw new ValidationError(["Lançamento não encontrado."]);
    await db.transactions.delete(id);
  });
}
