import type { ISODate, Transaction } from "./types";

/** Today's local calendar date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type EffectiveState = "actual" | "scheduled" | "planned";

/**
 * actual    = confirmed and date <= today (counts in balances and actual reports)
 * scheduled = confirmed but future-dated (labeled "Agendado", excluded until its date)
 * planned   = forecast only ("Previsto")
 * ISO dates compare correctly as strings.
 */
export function effectiveState(
  tx: Pick<Transaction, "status" | "date">,
  today: ISODate,
): EffectiveState {
  if (tx.status === "planned") return "planned";
  return tx.date <= today ? "actual" : "scheduled";
}

export const EFFECTIVE_STATE_LABEL: Record<EffectiveState, string> = {
  actual: "Realizado",
  scheduled: "Agendado",
  planned: "Previsto",
};
