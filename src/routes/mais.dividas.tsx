import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addDebtBalance,
  allocateDebtPayment,
  deleteDebt,
  readWealth,
  registerDebtPayment,
  reopenDebt,
  settleDebt,
} from "@/data/wealth";
import { newId } from "@/data/db";
import { todayISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { DEBT_TYPE_LABEL, debtStatus } from "@/domain/wealth";
import type { Debt, Transaction } from "@/domain/types";
import { centsToInput } from "@/ui/form";
import { EmptyState, PageHeader } from "@/ui/Page";
import { AmountDateDialog, DebtDialog, PaymentDialog } from "@/ui/WealthDialogs";
import { Card, ConfirmButton } from "@/ui/WealthBits";
import { fmtDate, meta, runAction } from "@/ui/wealthHelpers";

export const Route = createFileRoute("/mais/dividas")({
  head: () =>
    meta("Dívidas", "Empréstimos e financiamentos: saldo devedor, pagamentos e quitação."),
  component: Dividas,
});

const STATUS = { active: "Ativa", paid: "Quitada", archived: "Arquivada" } as const;

function Dividas() {
  const w = useLiveQuery(() => readWealth(), []);
  const [edit, setEdit] = useState<{ open: boolean; debt?: Debt | undefined }>({ open: false });
  const [balanceFor, setBalanceFor] = useState<Debt | null>(null);
  const [payFor, setPayFor] = useState<{ debt: Debt; requestId: string } | null>(null);
  const [classify, setClassify] = useState<Transaction | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (!w) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const debts = [...w.debts].sort((a, b) =>
    a.status === b.status ? a.name.localeCompare(b.name, "pt-BR") : a.status === "active" ? -1 : 1,
  );
  const card = (d: Debt) => {
    const s = debtStatus(d, w.debtBalances, w.transactions, w.today);
    const f = (v: number) => formatMoney(v, d.currency, w.locale);
    const pays = w.transactions
      .filter((t) => t.debtId === d.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const snaps = w.debtBalances
      .filter((b) => b.debtId === d.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return (
      <Card key={d.id} muted={d.status !== "active"}>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{d.name}</p>
            <p className="text-xs text-muted-foreground">
              {DEBT_TYPE_LABEL[d.debtType]} · {STATUS[d.status]}
              {d.interestRateBp !== undefined &&
                ` · ${centsToInput(d.interestRateBp)}% ${d.interestPeriod === "yearly" ? "a.a." : "a.m."}`}
              {d.dueDay && ` · vence dia ${d.dueDay}`}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{f(s.balance)}</p>
            <p className="text-xs text-muted-foreground">
              Saldo estimado · referência {fmtDate(s.referenceDate)}
            </p>
            {s.pending > 0 && (
              <p className="text-xs text-expense">{f(s.pending)} em pagamentos a classificar</p>
            )}
          </div>
        </div>
        {d.notes && <p className="text-sm text-muted-foreground">{d.notes}</p>}
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(open === d.id ? null : d.id)}>
            Histórico
          </Button>
          {d.status === "active" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPayFor({ debt: d, requestId: newId() })}
              >
                Registrar pagamento
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBalanceFor(d)}>
                Atualizar saldo
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEdit({ open: true, debt: d })}>
            Editar
          </Button>
          {d.status === "active" ? (
            <ConfirmButton
              label="Quitar"
              confirm="Confirmar quitação"
              onConfirm={() => runAction(() => settleDebt(d.id, todayISO()), "Dívida quitada")}
            />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runAction(() => reopenDebt(d.id), "Dívida reaberta")}
            >
              Reabrir
            </Button>
          )}
          {!pays.length && (
            <ConfirmButton
              label="Excluir"
              confirm="Excluir dívida"
              onConfirm={() => runAction(() => deleteDebt(d.id), "Dívida excluída")}
            />
          )}
        </div>
        {open === d.id && (
          <div className="grid gap-3 text-sm">
            <div>
              <p className="mb-1 font-semibold">Pagamentos e entradas</p>
              {!pays.length ? (
                <p className="text-muted-foreground">Nenhum.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {pays.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span>
                        {fmtDate(t.date)} ·{" "}
                        {t.type === "loan_proceeds"
                          ? "Entrada do empréstimo"
                          : t.allocation === "pending"
                            ? "A classificar"
                            : `Principal ${f(t.principalAmount ?? 0)} · juros ${f(t.interestAmount ?? 0)} · encargos ${f(t.feesAmount ?? 0)}`}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{f(t.amount)}</span>
                        {t.allocation === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => setClassify(t)}>
                            Classificar
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 font-semibold">Saldos informados</p>
              <ul className="divide-y rounded-lg border">
                {snaps.map((b) => (
                  <li key={b.id} className="flex justify-between px-3 py-2">
                    <span>
                      {fmtDate(b.date)}
                      {b.kind === "initial" ? " · Saldo inicial" : " · Saldo reconciliado"}
                      {b.note ? ` · ${b.note}` : ""}
                    </span>
                    <span className="tabular-nums">{f(b.balance)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    );
  };
  return (
    <>
      <PageHeader
        title="Dívidas"
        subtitle="Empréstimos e financiamentos. Cartões de crédito ficam em Contas, pelo saldo negativo."
      />
      <Button className="mb-5 h-11" onClick={() => setEdit({ open: true })}>
        <Plus className="h-4 w-4" /> Nova dívida
      </Button>
      {!debts.length ? (
        <EmptyState icon={<CreditCard className="h-6 w-6" />} title="Nenhuma dívida cadastrada">
          Cadastre empréstimos e financiamentos que não estejam em uma conta.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">{debts.map(card)}</ul>
      )}
      <DebtDialog
        open={edit.open}
        debt={edit.debt}
        accounts={w.accounts}
        defaultCurrency={w.currency}
        onOpenChange={(o) => setEdit((s) => ({ ...s, open: o }))}
      />
      <AmountDateDialog
        open={!!balanceFor}
        onOpenChange={(o) => !o && setBalanceFor(null)}
        title={`Atualizar saldo — ${balanceFor?.name ?? ""}`}
        description="Informe o saldo devedor do extrato. Saldos e pagamentos anteriores ficam no histórico."
        currency={balanceFor?.currency ?? "BRL"}
        amountLabel="Saldo devedor"
        onSave={async (v, d) => {
          if (!balanceFor) return;
          await addDebtBalance(balanceFor.id, v, d);
        }}
      />
      <PaymentDialog
        open={!!payFor}
        onOpenChange={(o) => !o && setPayFor(null)}
        currency={payFor?.debt.currency ?? "BRL"}
        accounts={w.accounts}
        onSave={async (p) => {
          if (!payFor) return;
          await registerDebtPayment(payFor.debt.id, { ...p, requestId: payFor.requestId });
        }}
      />
      <PaymentDialog
        open={!!classify}
        onOpenChange={(o) => !o && setClassify(null)}
        currency={classify?.currency ?? "BRL"}
        accounts={w.accounts}
        fixedAmount={classify?.amount}
        onSave={async (p) => {
          if (!classify || !p.split) return;
          await allocateDebtPayment(classify.id, p.split);
        }}
      />
    </>
  );
}
