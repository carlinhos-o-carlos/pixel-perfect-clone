import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { CalendarClock, Check, Pencil, Pause, Play, Plus, StopCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDb } from "@/data/db";
import { endRecurringRule, saveOccurrence, setRecurringRuleActive } from "@/data/recurring";
import { todayISO, effectiveState, EFFECTIVE_STATE_LABEL } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import {
  FREQUENCY_LABEL,
  futureWindowEnd,
  projectOccurrences,
  type RecurringOccurrence,
} from "@/domain/recurring";
import { Input } from "@/components/ui/input";
import type { RecurringRule } from "@/domain/types";
import { useEntry } from "@/ui/EntryContext";
import { EmptyState, PageHeader } from "@/ui/Page";
import { PlanningLinks } from "@/ui/PlanningControls";
import { RecurringRuleDialog } from "@/ui/RecurringRuleDialog";
import { DeleteRecurringRuleDialog } from "@/ui/DeleteRecurringRuleDialog";
import { errorMessages } from "@/ui/form";

export const Route = createFileRoute("/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento — Finanças" },
      { name: "description", content: "Orçamento, fluxo de caixa e lançamentos recorrentes." },
      { property: "og:title", content: "Planejamento — Finanças" },
      { property: "og:description", content: "Orçamento, fluxo de caixa e recorrentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Planejamento,
});

function Planejamento() {
  const { openEntry, openOccurrence } = useEntry();
  const [from, setFrom] = useState(todayISO());
  const [ending, setEnding] = useState<RecurringRule | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const [limit, setLimit] = useState(12);
  const [dialog, setDialog] = useState<{ open: boolean; rule?: RecurringRule | undefined }>({
    open: false,
  });
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [rules, transactions, skipped, accounts] = await Promise.all([
      db.recurringRules.toArray(),
      db.transactions.toArray(),
      db.skippedOccurrences.toArray(),
      db.accounts.toArray(),
    ]);
    return {
      rules: rules.sort(
        (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"),
      ),
      occurrences: projectOccurrences(rules, transactions, skipped, from, futureWindowEnd(from)),
      accounts,
    };
  }, [from]);

  async function act(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(errorMessages(error).join(" "));
    }
  }

  async function editOccurrence(occurrence: RecurringOccurrence) {
    if (occurrence.transaction) openEntry(occurrence.transaction);
    else openOccurrence(occurrence);
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-3">
        <PageHeader title="Planejamento" subtitle="Organize receitas e despesas que se repetem." />
        <Button aria-label="Nova recorrência" onClick={() => setDialog({ open: true })}>
          <Plus />
          Nova
        </Button>
      </div>
      <PlanningLinks />
      {!data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-8">
          <section>
            <h2 className="mb-3 text-xl font-semibold">Recorrentes</h2>
            {!data.rules.length ? (
              <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nenhuma recorrência">
                Cadastre salário, aluguel, assinaturas e outras movimentações repetidas.
              </EmptyState>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-soft">
                {data.rules.map((rule) => {
                  const account = data.accounts.find((item) => item.id === rule.accountId);
                  const status = rule.endedAt ? "Encerrada" : rule.active ? "Ativa" : "Pausada";
                  return (
                    <li key={rule.id} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                        <span className="block truncate font-semibold">{rule.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {FREQUENCY_LABEL[rule.frequency]} · {account?.name ?? "—"} · {status}
                        </span>
                      </div>
                      <span
                        className={
                          rule.type === "income"
                            ? "font-semibold text-income tabular-nums"
                            : "font-semibold text-expense tabular-nums"
                        }
                      >
                        {formatMoney(rule.amount, rule.currency)}
                      </span>
                      {!rule.endedAt && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar"
                            aria-label={`Editar ${rule.name}`}
                            onClick={() => setDialog({ open: true, rule })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={rule.active ? "Pausar" : "Retomar"}
                            aria-label={`${rule.active ? "Pausar" : "Retomar"} ${rule.name}`}
                            onClick={() =>
                              act(
                                () => setRecurringRuleActive(rule.id, !rule.active),
                                rule.active ? "Recorrência pausada" : "Recorrência retomada",
                              )
                            }
                          >
                            {rule.active ? <Pause /> : <Play />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            title="Encerrar"
                            aria-label={`Encerrar ${rule.name}`}
                            onClick={() => setEnding(rule)}
                          >
                            <StopCircle />
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        title="Excluir regra"
                        aria-label={`Excluir regra ${rule.name}`}
                        onClick={() => setDeleting(rule)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-1 text-xl font-semibold">Próximas ocorrências</h2>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label htmlFor="occ-from" className="text-sm text-muted-foreground">
                A partir de
              </label>
              <Input
                id="occ-from"
                className="w-auto"
                type="date"
                value={from}
                onChange={(e) => {
                  if (e.target.value) {
                    setFrom(e.target.value);
                    setLimit(12);
                  }
                }}
              />
              <span className="text-xs text-muted-foreground">
                Até {futureWindowEnd(from).split("-").reverse().join("/")}
              </span>
            </div>
            {!data.occurrences.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma ocorrência prevista.</p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-soft">
                {data.occurrences.slice(0, limit).map((occurrence) => (
                  <li
                    key={`${occurrence.recurringRuleId}:${occurrence.occurrenceDate}`}
                    className="flex flex-wrap items-center gap-3 p-4"
                  >
                    <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                      <p className="truncate font-medium">{occurrence.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }).format(new Date(`${occurrence.date}T00:00:00Z`))}{" "}
                        ·{" "}
                        {occurrence.transaction
                          ? EFFECTIVE_STATE_LABEL[
                              effectiveState(occurrence.transaction, todayISO())
                            ]
                          : "Previsto"}
                        {occurrence.transaction?.status === "planned" && " · Editado"}
                      </p>
                    </div>
                    <span
                      className={
                        occurrence.type === "income"
                          ? "font-semibold text-income tabular-nums"
                          : "font-semibold text-expense tabular-nums"
                      }
                    >
                      {formatMoney(occurrence.amount, occurrence.currency)}
                    </span>
                    {occurrence.transaction?.status !== "confirmed" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => editOccurrence(occurrence)}
                        >
                          <Pencil />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            act(
                              () => saveOccurrence(occurrence, "confirmed"),
                              "Ocorrência confirmada",
                            )
                          }
                        >
                          <Check />
                          Confirmar
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.occurrences.length > limit && (
              <Button variant="ghost" className="mt-3" onClick={() => setLimit((n) => n + 12)}>
                Mostrar mais
              </Button>
            )}
          </section>
        </div>
      )}
      <RecurringRuleDialog
        open={dialog.open}
        rule={dialog.rule}
        onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}
      />
      {ending && (
        <div
          role="alertdialog"
          aria-label="Encerrar recorrência"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4"
        >
          <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-soft">
            <h2 className="text-xl font-semibold">Encerrar {ending.name}?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O histórico e as ocorrências editadas serão preservados. Esta regra não poderá ser
              retomada.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setEnding(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  act(async () => {
                    await endRecurringRule(ending.id, todayISO());
                    setEnding(null);
                  }, "Recorrência encerrada")
                }
              >
                Confirmar encerramento
              </Button>
            </div>
          </div>
        </div>
      )}
      {deleting && <DeleteRecurringRuleDialog rule={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
