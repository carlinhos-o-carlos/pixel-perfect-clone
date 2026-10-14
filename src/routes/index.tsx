import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Wallet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDb } from "@/data/db";
import { getSettings } from "@/data/settings";
import { todayISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { computeBalances, monthSummary, totalsByCurrency } from "@/domain/transactions";
import { EmptyState, PageHeader } from "@/ui/Page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — Finanças" },
      {
        name: "description",
        content: "Resumo do mês: receitas, despesas e saldo, com seus dados só no seu dispositivo.",
      },
      { property: "og:title", content: "Início — Finanças" },
      {
        property: "og:description",
        content: "Finanças pessoais privadas, offline e sem cadastro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(),
  );
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [accounts, txs, settings] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      getSettings(db),
    ]);
    const today = todayISO();
    return {
      hasAccounts: accounts.length > 0,
      totals: totalsByCurrency(accounts, computeBalances(accounts, txs, today)),
      summary: monthSummary(txs, today.slice(0, 7), today),
      locale: settings.locale,
    };
  }, []);

  return (
    <>
      <PageHeader title="Olá!" subtitle={`Como vai sua vida financeira em ${month}?`} />
      {!data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !data.hasAccounts ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Comece cadastrando uma conta">
          <p>Depois registre receitas, despesas e transferências pelo botão +.</p>
          <Button asChild className="mt-4">
            <Link to="/mais/contas">Cadastrar conta</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {Object.entries(data.totals).map(([cur, total]) => {
            const s = data.summary[cur] ?? { income: 0, expense: 0 };
            return (
              <section key={cur} className="rounded-2xl border bg-card p-5 shadow-soft">
                <p className="text-sm text-muted-foreground">Saldo realizado ({cur})</p>
                <p className="text-3xl font-semibold tabular-nums">
                  {formatMoney(total, cur, data.locale)}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Receitas do mês</p>
                    <p className="font-semibold text-income tabular-nums">
                      {formatMoney(s.income, cur, data.locale)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Despesas do mês</p>
                    <p className="font-semibold text-expense tabular-nums">
                      {formatMoney(s.expense, cur, data.locale)}
                    </p>
                  </div>
                </div>
              </section>
            );
          })}
          <Link
            to="/mais/contas"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver saldos por conta
          </Link>
        </div>
      )}
      <div className="mt-6 flex gap-3 rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p>
          Sem cadastro e sem servidor: tudo fica guardado neste navegador. Faça backups regularmente
          — limpar os dados do navegador ou perder o aparelho apaga as informações.
        </p>
      </div>
    </>
  );
}
