import { getDb } from "./db";
import { getSettings } from "./settings";
import { planningTransactions } from "@/domain/planning";

/** One reactive, consistent read shared by all Phase 4 views; never writes forecasts. */
export async function readPlanning(from: string, to: string) {
  const db = getDb();
  return db.transaction("r", db.accounts, db.categories, db.transactions, db.recurringRules, db.skippedOccurrences, db.budgets, db.settings, async () => {
    const [accounts, categories, transactions, rules, skipped, budgets, settings] = await Promise.all([
      db.accounts.toArray(), db.categories.toArray(), db.transactions.toArray(),
      db.recurringRules.toArray(), db.skippedOccurrences.toArray(), db.budgets.toArray(), getSettings(db),
    ]);
    return { accounts, categories, budgets, settings, transactions: planningTransactions(transactions, rules, skipped, from, to) };
  });
}