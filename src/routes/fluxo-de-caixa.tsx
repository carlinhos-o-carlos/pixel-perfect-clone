import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readPlanning } from "@/data/planning";
import { EFFECTIVE_STATE_LABEL, todayISO } from "@/domain/dates";
import { cashFlow, monthBounds } from "@/domain/planning";
import { isISODate } from "@/domain/recurring";
import { formatMoney } from "@/domain/money";
import { CashFlowChart } from "@/ui/CashFlowChart";
import { PageHeader } from "@/ui/Page";
import { CurrencyControl, PlanningLinks } from "@/ui/PlanningControls";
import { Field, selectClass } from "@/ui/form";

export const Route = createFileRoute("/fluxo-de-caixa")({
  head: () => ({
    meta: [
      { title: "Fluxo de caixa — Finanças" },
      {
        name: "description",
        content:
          "Entradas, saídas e evolução dos saldos por conta e período, sem dupla contagem de recorrências.",
      },
      { property: "og:title", content: "Fluxo de caixa — Finanças" },
      { property: "og:description", content: "Compare saldos realizados, agendados e previstos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Fluxo,
});

function Fluxo() {
  const today = todayISO();
  const bounds = monthBounds(today.slice(0, 7));
  const [from, setFrom] = useState(bounds?.from ?? today);
  const [to, setTo] = useState(bounds?.to ?? today);
  const [currency, setCurrency] = useState("BRL");
  const [accountId, setAccountId] = useState("");
  const valid =
    isISODate(from) &&
    isISODate(to) &&
    from <= to &&
    Number(to.slice(0, 4)) - Number(from.slice(0, 4)) <= 5;
  const data = useLiveQuery(
    () => readPlanning(valid && from < today ? from : today, valid ? to : today),
    [from, to, valid],
  );
  const flow =
    data && valid
      ? cashFlow(data.accounts, data.transactions, from, to, today, currency, accountId)
      : null;
  const money = (value: number) => formatMoney(value, currency, data?.settings.locale ?? "pt-BR");
  return (
    <>
      <PageHeader title="Fluxo de caixa" subtitle="Entradas, saídas e saldos ao longo do tempo." />
      <PlanningLinks />
      <div className="mb-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-4">
        <Field label="De" htmlFor="flow-from">
          <Input
            id="flow-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Até" htmlFor="flow-to">
          <Input id="flow-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <CurrencyControl
          currency={currency}
          currencies={[...new Set(["BRL", ...(data?.accounts.map((a) => a.currency) ?? [])])]}
          onChange={(c) => {
            setCurrency(c);
            setAccountId("");
          }}
        />
        <Field label="Conta" htmlFor="flow-account">
          <select
            className={selectClass}
            id="flow-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Contas ativas</option>
            {data?.accounts
              .filter((a) => a.currency === currency)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? " (arquivada)" : ""}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {!valid ? (
        <p role="alert" className="text-destructive">
          Selecione um período válido de até cinco anos.
        </p>
      ) : !flow ? (
        <p>Carregando…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 border-y py-5">
            {[
              ["Saldo inicial realizado", flow.opening],
              ["Saldo inicial projetado", flow.projectedOpening],
              ["Saldo final realizado", flow.actualClosing],
              ["Saldo final projetado", flow.projectedClosing],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="break-words text-xl font-semibold tabular-nums">
                  {money(Number(value))}
                </p>
              </div>
            ))}
          </section>
          <CashFlowChart
            flow={flow}
            from={from}
            currency={currency}
            locale={data?.settings.locale ?? "pt-BR"}
          />
          <div className="mb-5 flex flex-wrap gap-4 text-xs">
            <span className="text-income">— Saldo realizado</span>
            <span className="text-scheduled">- - Saldo projetado</span>
          </div>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <span>
              Entradas: <strong className="text-income">{money(flow.income)}</strong>
            </span>
            <span>
              Saídas: <strong className="text-expense">{money(flow.expense)}</strong>
            </span>
            {flow.transfers !== 0 && <span>Transferências líquidas: {money(flow.transfers)}</span>}
            {flow.other !== 0 && <span>Outras operações: {money(flow.other)}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-3 text-left">Data / estado</th>
                  <th>Entradas</th>
                  <th>Saídas</th>
                  <th>Mov. realizada</th>
                  <th>Agendada</th>
                  <th>Prevista</th>
                  <th>Saldo projetado</th>
                </tr>
              </thead>
              <tbody>
                {flow.days.map((day) => (
                  <tr key={day.date} className="border-b">
                    <td className="py-3 text-left">
                      <strong>{day.date.split("-").reverse().join("/")}</strong>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {day.states.map((s) => EFFECTIVE_STATE_LABEL[s]).join(" · ")}
                      </div>
                    </td>
                    <td className="text-income">{money(day.income)}</td>
                    <td className="text-expense">{money(day.expense)}</td>
                    <td>{money(day.actual)}</td>
                    <td className="text-scheduled">{money(day.scheduled)}</td>
                    <td className="text-planned">{money(day.planned)}</td>
                    <td className="font-semibold">{money(day.projectedBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!flow.days.length && (
            <p className="py-8 text-center text-muted-foreground">
              Nenhuma movimentação neste período.
            </p>
          )}
        </>
      )}
    </>
  );
}
