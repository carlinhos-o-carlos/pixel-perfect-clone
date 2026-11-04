import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addGoalAllocation,
  deleteGoal,
  deleteGoalAllocation,
  readWealth,
  setGoalStatus,
  updateGoalAllocation,
} from "@/data/wealth";
import { formatMoney } from "@/domain/money";
import { GOAL_TYPE_LABEL, allocationCapacity, goalProgress } from "@/domain/wealth";
import type { Goal, GoalAllocation } from "@/domain/types";
import { EmptyState, PageHeader } from "@/ui/Page";
import { AmountDateDialog, GoalDialog } from "@/ui/WealthDialogs";
import { Card, ConfirmButton, fmtDate, meta, runAction } from "@/ui/WealthBits";

export const Route = createFileRoute("/mais/metas")({
  head: () =>
    meta(
      "Metas financeiras",
      "Metas com valor-alvo, contribuições e progresso, sem contar o mesmo dinheiro duas vezes.",
    ),
  component: Metas,
});

const STATUS = { active: "Ativa", achieved: "Concluída", archived: "Arquivada" } as const;

function Metas() {
  const w = useLiveQuery(() => readWealth(), []);
  const [edit, setEdit] = useState<{ open: boolean; goal?: Goal | undefined }>({ open: false });
  const [contrib, setContrib] = useState<{ goal: Goal; row?: GoalAllocation | undefined } | null>(
    null,
  );
  const [open, setOpen] = useState<string | null>(null);
  if (!w) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const order = { active: 0, achieved: 1, archived: 2 };
  const goals = [...w.goals].sort(
    (a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, "pt-BR"),
  );
  const currencies = [...new Set(goals.map((g) => g.currency))];
  return (
    <>
      <PageHeader
        title="Metas financeiras"
        subtitle="Contribuições reservam dinheiro que já está nas contas: não são receitas e não aumentam o patrimônio."
      />
      <Button className="mb-5 h-11" onClick={() => setEdit({ open: true })}>
        <Plus className="h-4 w-4" /> Nova meta
      </Button>
      {currencies.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-3">
          {currencies.map((c) => {
            const cap = allocationCapacity(c, w.accounts, w.balances, w.goals, w.allocations);
            return (
              <div key={c} className="rounded-2xl bg-secondary px-4 py-3 text-sm">
                <p className="text-xs text-muted-foreground">Reservado em metas ({c})</p>
                <p className="font-semibold tabular-nums">
                  {formatMoney(cap.allocated, c, w.locale)} de{" "}
                  {formatMoney(cap.available, c, w.locale)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Livre para reservar: {formatMoney(Math.max(0, cap.free), c, w.locale)}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {!goals.length ? (
        <EmptyState icon={<Target className="h-6 w-6" />} title="Nenhuma meta ainda">
          Crie metas como reserva de emergência, viagem ou compra de veículo.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {goals.map((g) => {
            const p = goalProgress(g, w.allocations);
            const f = (v: number) => formatMoney(v, g.currency, w.locale);
            const rows = w.allocations
              .filter((a) => a.goalId === g.id)
              .sort((a, b) => b.date.localeCompare(a.date));
            return (
              <Card key={g.id} muted={g.status === "archived"}>
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {GOAL_TYPE_LABEL[g.goalType]} · {STATUS[g.status]}
                      {g.targetDate && ` · até ${fmtDate(g.targetDate)}`}
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">
                    {f(p.saved)}{" "}
                    <span className="font-normal text-muted-foreground">de {f(g.target)}</span>
                  </p>
                </div>
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
                <progress
                  aria-label={`Progresso de ${g.name}`}
                  className="budget-progress h-2 w-full"
                  max={100}
                  value={p.percent}
                />
                <p className="text-sm text-muted-foreground">
                  {p.percent}% ·{" "}
                  {p.reached
                    ? p.surplus > 0
                      ? `Meta atingida, ${f(p.surplus)} acima do alvo`
                      : "Meta atingida"
                    : `Faltam ${f(p.remaining)}`}
                </p>
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpen(open === g.id ? null : g.id)}
                  >
                    Contribuições ({rows.length})
                  </Button>
                  {g.status !== "archived" && (
                    <Button size="sm" variant="ghost" onClick={() => setContrib({ goal: g })}>
                      Contribuir
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEdit({ open: true, goal: g })}
                  >
                    Editar
                  </Button>
                  {g.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        runAction(() => setGoalStatus(g.id, "achieved"), "Meta concluída")
                      }
                    >
                      Concluir
                    </Button>
                  )}
                  {g.status !== "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        runAction(() => setGoalStatus(g.id, "active"), "Meta reativada")
                      }
                    >
                      Reativar
                    </Button>
                  )}
                  {g.status !== "archived" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        runAction(() => setGoalStatus(g.id, "archived"), "Meta arquivada")
                      }
                    >
                      Arquivar
                    </Button>
                  )}
                  <ConfirmButton
                    label="Excluir"
                    confirm="Excluir meta e contribuições"
                    onConfirm={() => runAction(() => deleteGoal(g.id), "Meta excluída")}
                  />
                </div>
                {open === g.id && (
                  <ul className="divide-y rounded-lg border text-sm">
                    {!rows.length && (
                      <li className="px-3 py-2 text-muted-foreground">Nenhuma contribuição.</li>
                    )}
                    {rows.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <span>
                          {fmtDate(r.date)}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="tabular-nums">{f(r.amount)}</span>
                          {g.status !== "archived" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setContrib({ goal: g, row: r })}
                            >
                              Editar
                            </Button>
                          )}
                          <ConfirmButton
                            label="Excluir"
                            confirm="Excluir"
                            onConfirm={() =>
                              runAction(() => deleteGoalAllocation(r.id), "Contribuição excluída")
                            }
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </ul>
      )}
      <GoalDialog
        open={edit.open}
        goal={edit.goal}
        defaultCurrency={w.currency}
        hasAllocations={!!edit.goal && w.allocations.some((a) => a.goalId === edit.goal!.id)}
        onOpenChange={(o) => setEdit((s) => ({ ...s, open: o }))}
      />
      <AmountDateDialog
        open={!!contrib}
        onOpenChange={(o) => !o && setContrib(null)}
        title={contrib?.row ? "Editar contribuição" : `Contribuir — ${contrib?.goal.name ?? ""}`}
        description="Use valor negativo para retirar. O total reservado não pode passar do dinheiro disponível nas contas."
        currency={contrib?.goal.currency ?? "BRL"}
        amountLabel="Valor"
        allowNegative
        withNote
        initial={contrib?.row}
        onSave={(amount, date, note) =>
          contrib!.row
            ? updateGoalAllocation(contrib!.goal.id, contrib!.row.id, { amount, date, note })
            : addGoalAllocation(contrib!.goal.id, { amount, date, note })
        }
      />
    </>
  );
}
