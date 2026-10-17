import { formatMoney } from "@/domain/money";
import type { BudgetUsage } from "@/domain/planning";
import { cn } from "@/lib/utils";

export function BudgetMeter({ usage, locale }: { usage: BudgetUsage; locale: string }) {
  const warning = usage.state !== "normal";
  return <div className="mt-3 grid gap-2 text-sm">
    <div className="flex flex-wrap justify-between gap-1"><span>{formatMoney(usage.used, usage.budget.currency, locale)} utilizados</span><span className={cn("font-semibold", warning && "text-expense")}>{usage.percent}% · {usage.state === "over" ? "Acima do limite" : usage.state === "limit" ? "Limite atingido" : usage.state === "near" ? "Próximo do limite" : "Dentro do limite"}</span></div>
    <progress aria-label="Percentual utilizado" className={cn("budget-progress h-2 w-full", warning && "budget-warning")} max={100} value={Math.min(100, usage.percent)} />
    <p className={cn("text-muted-foreground", usage.remaining < 0 && "text-expense")}>Restante: {formatMoney(usage.remaining, usage.budget.currency, locale)}</p>
  </div>;
}