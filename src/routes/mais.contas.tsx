import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDb } from "@/data/db";
import { deleteAccount, setAccountArchived } from "@/data/accounts";
import { getSettings } from "@/data/settings";
import { ACCOUNT_KIND_LABEL } from "@/domain/accounts";
import { todayISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { computeBalances, totalsByCurrency } from "@/domain/transactions";
import type { Account } from "@/domain/types";
import { AccountDialog } from "@/ui/AccountDialog";
import { errorMessages } from "@/ui/form";
import { EmptyState, PageHeader } from "@/ui/Page";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mais/contas")({
  head: () => ({
    meta: [
      { title: "Contas — Finanças" },
      { name: "description", content: "Suas contas, cartões e saldos por moeda." },
      { property: "og:title", content: "Contas — Finanças" },
      { property: "og:description", content: "Suas contas, cartões e saldos por moeda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contas,
});

function Contas() {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [accounts, txs, settings] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      getSettings(db),
    ]);
    const today = todayISO();
    return {
      accounts: accounts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      actual: computeBalances(accounts, txs, today),
      projected: computeBalances(accounts, txs, today, "projected"),
      used: new Set(txs.flatMap((t) => [t.accountId, t.destinationAccountId ?? ""])),
      settings,
    };
  }, []);
  const [dialog, setDialog] = useState<{ open: boolean; account?: Account | undefined }>({
    open: false,
  });

  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const { accounts, actual, projected, used, settings } = data;
  const loc = settings.locale;
  const totals = totalsByCurrency(accounts, actual);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  async function run(fn: () => Promise<void>, msg: string) {
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessages(e)[0]);
    }
  }

  const row = (a: Account) => (
    <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{a.name}</p>
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_KIND_LABEL[a.kind]} · {a.currency}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("font-semibold tabular-nums", (actual[a.id] ?? 0) < 0 && "text-expense")}>
          {formatMoney(actual[a.id] ?? 0, a.currency, loc)}
        </p>
        {(projected[a.id] ?? 0) !== (actual[a.id] ?? 0) && (
          <p className="text-xs text-muted-foreground">
            Previsto: {formatMoney(projected[a.id] ?? 0, a.currency, loc)}
          </p>
        )}
      </div>
      <div className="flex w-full justify-end gap-1 sm:w-auto">
        <Button size="sm" variant="ghost" onClick={() => setDialog({ open: true, account: a })}>
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            run(
              () => setAccountArchived(a.id, !a.archived),
              a.archived ? "Conta reativada" : "Conta arquivada",
            )
          }
        >
          {a.archived ? "Reativar" : "Arquivar"}
        </Button>
        {!used.has(a.id) && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => run(() => deleteAccount(a.id), "Conta excluída")}
          >
            Excluir
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <>
      <PageHeader
        title="Contas"
        subtitle="Saldo realizado: saldo inicial + lançamentos confirmados até hoje."
      />
      <Button className="mb-5 h-11" onClick={() => setDialog({ open: true })}>
        <Plus className="h-4 w-4" /> Nova conta
      </Button>
      {!accounts.length ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Nenhuma conta ainda">
          Cadastre conta corrente, poupança, dinheiro, corretora ou cartão de crédito.
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          {Object.keys(totals).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {Object.entries(totals).map(([cur, v]) => (
                <div key={cur} className="rounded-2xl bg-secondary px-4 py-3">
                  <p className="text-xs text-muted-foreground">Total em {cur}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatMoney(v, cur, loc)}</p>
                </div>
              ))}
            </div>
          )}
          {active.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
              {active.map(row)}
            </ul>
          )}
          {archived.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Arquivadas
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card opacity-75 shadow-soft">
                {archived.map(row)}
              </ul>
            </section>
          )}
        </div>
      )}
      <AccountDialog
        open={dialog.open}
        account={dialog.account}
        defaultCurrency={settings.displayCurrency}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </>
  );
}
