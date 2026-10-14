import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { ListOrdered } from "lucide-react";
import { getDb } from "@/data/db";
import { getSettings } from "@/data/settings";
import { todayISO } from "@/domain/dates";
import { ENTRY_TYPE_LABEL, filterTransactions, type EntryType } from "@/domain/transactions";
import { useEntry } from "@/ui/EntryContext";
import { selectClass } from "@/ui/form";
import { EmptyState, PageHeader } from "@/ui/Page";
import { TransactionRow } from "@/ui/TransactionRow";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos — Finanças" },
      { name: "description", content: "Receitas, despesas e transferências do mês." },
      { property: "og:title", content: "Lançamentos — Finanças" },
      { property: "og:description", content: "Receitas, despesas e transferências do mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Lancamentos,
});

function Lancamentos() {
  const { openEntry } = useEntry();
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [type, setType] = useState<EntryType | "">("");
  const [accountId, setAccountId] = useState("");
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [txs, accounts, categories, settings] = await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
      getSettings(db),
    ]);
    return { txs, accounts, categories, settings };
  }, []);

  const today = todayISO();
  const list = data
    ? filterTransactions(data.txs, {
        month: month || undefined,
        type: type || undefined,
        accountId: accountId || undefined,
      })
    : [];

  return (
    <>
      <PageHeader title="Lançamentos" subtitle="Toque em um lançamento para editar ou excluir." />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input
          type="month"
          aria-label="Mês"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-11"
        />
        <select
          aria-label="Tipo"
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value as EntryType | "")}
        >
          <option value="">Todos os tipos</option>
          {(Object.keys(ENTRY_TYPE_LABEL) as EntryType[]).map((t) => (
            <option key={t} value={t}>
              {ENTRY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="Conta"
          className={selectClass}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Todas as contas</option>
          {data?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {!data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !list.length ? (
        <EmptyState
          icon={<ListOrdered className="h-6 w-6" />}
          title={data.txs.length ? "Nada neste filtro" : "Nenhum lançamento ainda"}
        >
          {data.txs.length
            ? "Mude o mês, o tipo ou a conta."
            : "Use o botão + para registrar uma receita, despesa ou transferência."}
        </EmptyState>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          {list.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              today={today}
              locale={data.settings.locale}
              accounts={new Map(data.accounts.map((a) => [a.id, a]))}
              categories={new Map(data.categories.map((c) => [c.id, c]))}
              onClick={() => openEntry(tx)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
