import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Wallet, ShieldCheck, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readPlanning } from "@/data/planning";
import { todayISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { budgetUsage, categoryExpenses, monthBounds, periodTotals } from "@/domain/planning";
import { computeBalances, totalsByCurrency } from "@/domain/transactions";
import { EmptyState, PageHeader } from "@/ui/Page";
import { CurrencyControl, MonthControl, PlanningLinks } from "@/ui/PlanningControls";
import { BudgetMeter } from "@/ui/BudgetMeter";
import { useEntry } from "@/ui/EntryContext";
import { TransactionRow } from "@/ui/TransactionRow";
import type { Transaction } from "@/domain/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — Finanças" },
      {
        name: "description",
        content:
          "Receitas, despesas, saldo projetado e orçamento mensal, com seus dados só no seu dispositivo.",
      },
      { property: "og:title", content: "Início — Finanças" },
      {
        property: "og:description",
        content: "Sua situação financeira: realizado, agendado e previsto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [currency, setCurrency] = useState("BRL");
  const { openNewEntry, openEntry, openOccurrence } = useEntry();
  const bounds = monthBounds(month);
  const from = bounds?.from ?? today;
  const to = bounds?.to ?? today;
  const data = useLiveQuery(() => readPlanning(from < today ? from : today, to), [month]);
  const money = (v: number) => formatMoney(v, currency, data?.settings.locale ?? "pt-BR");
  const actual = data ? computeBalances(data.accounts, data.transactions, today) : {};
  const projected = data
    ? computeBalances(
        data.accounts,
        data.transactions.filter((t) => t.date <= to),
        today,
        "projected",
      )
    : {};
  const total = data ? (totalsByCurrency(data.accounts, actual)[currency] ?? 0) : 0;
  const projectedTotal = data ? (totalsByCurrency(data.accounts, projected)[currency] ?? 0) : 0;
  const summary = data ? periodTotals(data.transactions, from, to, today, currency) : null;
  const usages = data ? budgetUsage(data.budgets, data.transactions, month, today, currency) : [];
  const expenses = data
    ? Object.entries(categoryExpenses(data.transactions, from, to, today, currency)).sort(
        (a, b) => b[1] - a[1],
      )
    : [];
  const upcoming =
    data?.transactions
      .filter(
        (t) =>
          t.currency === currency &&
          t.date >= today &&
          t.date <= to &&
          (t.status === "planned" || t.date > today),
      )
      .sort((a, b) => a.date.localeCompare(b.date)) ?? [];
  function edit(tx: Transaction) {
    if (
      tx.id.startsWith("forecast:") &&
      tx.recurringRuleId &&
      tx.occurrenceDate &&
      (tx.type === "income" || tx.type === "expense")
    ) {
      openOccurrence({
        recurringRuleId: tx.recurringRuleId,
        occurrenceDate: tx.occurrenceDate,
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        accountId: tx.accountId,
        categoryId: tx.categoryId ?? "",
        description: tx.description,
      });
    } else openEntry(tx);
  }
  return (
    <>
      <PageHeader title="Sua vida financeira" subtitle="Um olhar sobre o mês." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => openNewEntry("income")}>
          <ArrowDownLeft className="text-income" />
          Receita
        </Button>
        <Button variant="outline" onClick={() => openNewEntry("expense")}>
          <ArrowUpRight className="text-expense" />
          Despesa
        </Button>
        <Button variant="outline" onClick={() => openNewEntry("transfer")}>
          <ArrowLeftRight />
          Transferência
        </Button>
      </div>
      <PlanningLinks />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <MonthControl month={month} onChange={setMonth} />
        <CurrencyControl
          currency={currency}
          currencies={[
            ...new Set([
              "BRL",
              ...(data?.accounts.map((a) => a.currency) ?? []),
              ...(data?.budgets.map((b) => b.currency) ?? []),
            ]),
          ]}
          onChange={setCurrency}
        />
      </div>
      {!data ? (
        <p>Carregando…</p>
      ) : !data.accounts.length ? (
        <EmptyState icon={<Wallet />} title="Comece cadastrando uma conta">
          <Button asChild className="mt-4">
            <Link to="/mais/contas">Cadastrar conta</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          <section className="grid grid-cols-2 gap-4 border-y py-5">
            <div>
              <p className="text-sm text-muted-foreground">Saldo atual realizado</p>
              <p
                className="break-words text-2xl font-semibold tabular-nums"
                data-testid="current-balance"
              >
                {money(total)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Até {today.split("-").reverse().join("/")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo projetado</p>
              <p
                className="break-words text-2xl font-semibold text-scheduled tabular-nums"
                data-testid="projected-balance"
              >
                {money(projectedTotal)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Até {to.split("-").reverse().join("/")}
              </p>
            </div>
          </section>
          {summary && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">Receitas e despesas do mês</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Estado</th>
                      <th>Receitas</th>
                      <th>Despesas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["actual", "Realizado"],
                        ["scheduled", "Agendado"],
                        ["planned", "Previsto"],
                        ["expected", "Total projetado"],
                      ] as const
                    ).map(([key, label]) => (
                      <tr key={key} className="border-t">
                        <th className="py-3 text-left font-medium">{label}</th>
                        <td className="text-income tabular-nums">{money(summary[key].income)}</td>
                        <td className="text-expense tabular-nums">{money(summary[key].expense)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Contas</h2>
              <Button variant="ghost" asChild>
                <Link to="/mais/contas">Ver todas</Link>
              </Button>
            </div>
            <ul className="divide-y">
              {data.accounts
                .filter((a) => !a.archived && a.currency === currency)
                .map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="min-w-0 break-words font-medium">{a.name}</span>
                    <div className="text-right text-sm">
                      <p>
                        {money(actual[a.id] ?? 0)}{" "}
                        <span className="text-muted-foreground">atual</span>
                      </p>
                      <p className="text-scheduled">{money(projected[a.id] ?? 0)} projetado</p>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">Próximos lançamentos</h2>
            {!upcoming.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento futuro até o fim deste mês.
              </p>
            ) : (
              <ul className="divide-y">
                {upcoming.slice(0, 6).map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    accounts={new Map(data.accounts.map((a) => [a.id, a]))}
                    categories={new Map(data.categories.map((c) => [c.id, c]))}
                    today={today}
                    locale={data.settings.locale}
                    onClick={() => edit(tx)}
                  />
                ))}
              </ul>
            )}
            <Button className="mt-2" variant="ghost" asChild>
              <Link to="/fluxo-de-caixa">Ver fluxo de caixa</Link>
            </Button>
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">Despesas realizadas por categoria</h2>
            {!expenses.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa realizada neste mês.</p>
            ) : (
              <ul className="divide-y">
                {expenses.map(([id, amount]) => {
                  const cat = data.categories.find((c) => c.id === id);
                  return (
                    <li key={id} className="flex justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0 break-words">
                        {cat?.name ?? "Categoria removida"}
                        {cat?.archived ? " · Arquivada" : ""}
                      </span>
                      <strong className="shrink-0 text-expense tabular-nums">
                        {money(amount)}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Orçamento do mês</h2>
              <Button variant="ghost" asChild>
                <Link to="/orcamento">Ver limites</Link>
              </Button>
            </div>
            {!usages.length ? (
              <p className="text-sm text-muted-foreground">Nenhum limite definido neste mês.</p>
            ) : (
              <div className="grid gap-3">
                {usages.map((usage) => (
                  <article key={usage.budget.id} className="rounded-lg border bg-card p-4">
                    <h3 className="break-words font-semibold">
                      {data.categories.find((c) => c.id === usage.budget.categoryId)?.name ??
                        "Categoria removida"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Orçado: {money(usage.budget.amount)}
                    </p>
                    <BudgetMeter usage={usage} locale={data.settings.locale} />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <div className="mt-8 flex gap-3 border-t py-4 text-xs text-muted-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p>
          Seus dados ficam neste navegador. Limpar os dados ou perder o aparelho apaga as
          informações.
        </p>
      </div>
    </>
  );
}
