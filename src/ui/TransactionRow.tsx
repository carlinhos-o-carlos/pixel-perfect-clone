import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { EFFECTIVE_STATE_LABEL, effectiveState } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import type { Account, Category, Transaction } from "@/domain/types";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function TransactionRow({
  tx,
  accounts,
  categories,
  today,
  locale,
  onClick,
}: {
  tx: Transaction;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  today: string;
  locale: string;
  onClick: () => void;
}) {
  const state = effectiveState(tx, today);
  const Icon =
    tx.type === "income" ? ArrowDownLeft : tx.type === "transfer" ? ArrowLeftRight : ArrowUpRight;
  const acc = accounts.get(tx.accountId)?.name ?? "—";
  const dest = tx.destinationAccountId ? accounts.get(tx.destinationAccountId)?.name : undefined;
  const cat = tx.categoryId ? categories.get(tx.categoryId)?.name : undefined;
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted",
          state !== "actual" && "opacity-80",
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            tx.type === "income" && "bg-income/15 text-income",
            tx.type === "expense" && "bg-expense/15 text-expense",
            tx.type === "transfer" && "bg-accent text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{tx.description}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {dateFmt.format(new Date(tx.date))} · {cat ? `${cat} · ` : ""}
            {dest ? `${acc} → ${dest}` : acc}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={cn(
              "font-semibold tabular-nums",
              tx.type === "income" && "text-income",
              tx.type === "expense" && "text-expense",
              state === "planned" && "italic",
            )}
          >
            {sign}
            {formatMoney(tx.amount, tx.currency, locale)}
          </span>
          {state !== "actual" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                state === "planned"
                  ? "bg-planned/15 text-planned"
                  : "bg-scheduled/15 text-scheduled",
              )}
            >
              {EFFECTIVE_STATE_LABEL[state]}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
