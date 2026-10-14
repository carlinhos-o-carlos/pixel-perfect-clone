import type { Account, Category, ISODate, Transaction, TransactionStatus } from "./types";
import { categoryKindFor, isCategoryCompatible } from "./categories";
import { effectiveState } from "./dates";
import { addCents, type Cents, type CurrencyCode } from "./money";

/** Types the user can create in Phase 2 (debt types come later). */
export type EntryType = "income" | "expense" | "transfer";

export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
};

export interface TransactionDraft {
  type: EntryType;
  status: TransactionStatus;
  date: ISODate;
  amount: Cents;
  accountId: string;
  destinationAccountId?: string | undefined;
  categoryId?: string | undefined;
  description: string;
  notes?: string | undefined;
}

/**
 * Validate a draft. `previous` is the stored version when editing: an account or
 * category that was archived after the entry was made may stay on that entry,
 * but cannot be newly chosen.
 */
export function validateTransaction(
  d: TransactionDraft,
  accounts: Account[],
  categories: Category[],
  previous?: Transaction,
): string[] {
  const errors: string[] = [];
  if (!["income", "expense", "transfer"].includes(d.type))
    errors.push("Tipo de lançamento inválido.");
  if (!["confirmed", "planned"].includes(d.status)) errors.push("Status inválido.");
  if (!Number.isSafeInteger(d.amount) || d.amount <= 0)
    errors.push("O valor precisa ser maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(Date.parse(d.date)))
    errors.push("Informe uma data válida.");
  if (!d.description.trim()) errors.push("Informe uma descrição.");

  const acc = accounts.find((a) => a.id === d.accountId);
  if (!acc) errors.push("Selecione uma conta.");
  else if (acc.archived && previous?.accountId !== acc.id)
    errors.push(`A conta "${acc.name}" está arquivada.`);

  if (d.type === "transfer") {
    const dest = accounts.find((a) => a.id === d.destinationAccountId);
    if (!dest) errors.push("Selecione a conta de destino.");
    else {
      if (acc && dest.id === acc.id)
        errors.push("A conta de destino precisa ser diferente da origem.");
      if (dest.archived && previous?.destinationAccountId !== dest.id)
        errors.push(`A conta "${dest.name}" está arquivada.`);
      if (acc && dest.currency !== acc.currency)
        errors.push("Transferências entre moedas diferentes ainda não são permitidas.");
    }
  } else if (d.destinationAccountId) {
    errors.push("Somente transferências têm conta de destino.");
  }

  if (d.categoryId) {
    const cat = categories.find((c) => c.id === d.categoryId);
    if (!cat) errors.push("Categoria não encontrada.");
    else {
      if (!isCategoryCompatible(d.type, cat.kind))
        errors.push("Essa categoria não combina com o tipo de lançamento.");
      if (cat.archived && previous?.categoryId !== cat.id)
        errors.push(`A categoria "${cat.name}" está arquivada.`);
    }
  } else if (categoryKindFor(d.type) !== "transfer") {
    errors.push("Selecione uma categoria.");
  }
  return errors;
}

/** Signed effect of a transaction on each account it touches. */
export function accountEffects(tx: Transaction): Array<[string, Cents]> {
  switch (tx.type) {
    case "income":
    case "loan_proceeds":
      return [[tx.accountId, tx.amount]];
    case "expense":
    case "debt_payment":
      return [[tx.accountId, -tx.amount]];
    case "transfer":
      return tx.destinationAccountId
        ? [
            [tx.accountId, -tx.amount],
            [tx.destinationAccountId, tx.amount],
          ]
        : [[tx.accountId, -tx.amount]];
  }
}

/**
 * Balance per account id.
 * actual    = opening + confirmed entries dated up to today.
 * projected = actual + scheduled (future confirmed) + planned entries.
 */
export function computeBalances(
  accounts: Account[],
  txs: Transaction[],
  today: ISODate,
  mode: "actual" | "projected" = "actual",
): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  for (const a of accounts) out[a.id] = a.openingBalance;
  for (const tx of txs) {
    if (mode === "actual" && effectiveState(tx, today) !== "actual") continue;
    for (const [id, delta] of accountEffects(tx)) {
      if (id in out) out[id] = addCents(out[id], delta);
    }
  }
  return out;
}

/** Sum balances per currency (never converts). Archived accounts are skipped. */
export function totalsByCurrency(
  accounts: Account[],
  balances: Record<string, Cents>,
): Record<CurrencyCode, Cents> {
  const out: Record<CurrencyCode, Cents> = {};
  for (const a of accounts) {
    if (a.archived) continue;
    out[a.currency] = addCents(out[a.currency] ?? 0, balances[a.id] ?? 0);
  }
  return out;
}

export interface MonthSummary {
  income: Cents;
  expense: Cents;
}

/** Actual income/expense for a "YYYY-MM" month, per currency. Transfers never count. */
export function monthSummary(
  txs: Transaction[],
  month: string,
  today: ISODate,
): Record<CurrencyCode, MonthSummary> {
  const out: Record<CurrencyCode, MonthSummary> = {};
  for (const tx of txs) {
    if (!tx.date.startsWith(month) || effectiveState(tx, today) !== "actual") continue;
    if (tx.type !== "income" && tx.type !== "expense") continue;
    const s = (out[tx.currency] ??= { income: 0, expense: 0 });
    s[tx.type] = addCents(s[tx.type], tx.amount);
  }
  return out;
}

export interface TransactionFilter {
  month?: string; // "YYYY-MM"
  type?: EntryType;
  accountId?: string;
}

/** Filter and sort newest first. An account filter matches source or destination. */
export function filterTransactions(txs: Transaction[], f: TransactionFilter): Transaction[] {
  return txs
    .filter(
      (t) =>
        (!f.month || t.date.startsWith(f.month)) &&
        (!f.type || t.type === f.type) &&
        (!f.accountId || t.accountId === f.accountId || t.destinationAccountId === f.accountId),
    )
    .sort((a, b) =>
      a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
    );
}
