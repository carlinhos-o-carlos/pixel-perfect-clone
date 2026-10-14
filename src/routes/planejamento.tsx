import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { CalendarClock, Check, Pencil, Pause, Play, Plus, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDb } from "@/data/db";
import { endRecurringRule, saveOccurrence, setRecurringRuleActive } from "@/data/recurring";
import { todayISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { FREQUENCY_LABEL, projectOccurrences, type RecurringOccurrence } from "@/domain/recurring";
import type { RecurringRule } from "@/domain/types";
import { useEntry } from "@/ui/EntryContext";
import { EmptyState, PageHeader, PhaseBadge } from "@/ui/Page";
import { RecurringRuleDialog } from "@/ui/RecurringRuleDialog";
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

function addMonths(date: string, count: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + count);
  return d.toISOString().slice(0, 10);
}

function Planejamento() {
  const { openEntry } = useEntry();
  const [dialog, setDialog] = useState<{ open: boolean; rule?: RecurringRule | undefined }>({ open: false });
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [rules, transactions, skipped, accounts] = await Promise.all([
      db.recurringRules.toArray(), db.transactions.toArray(), db.skippedOccurrences.toArray(), db.accounts.toArray(),
    ]);
    const today = todayISO();
    return {
      rules: rules.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR")),
      occurrences: projectOccurrences(rules, transactions, skipped, today, addMonths(today, 3)).slice(0, 12),
      accounts,
    };
  }, []);

  async function act(action: () => Promise<unknown>, message: string) {
    try { await action(); toast.success(message); }
    catch (error) { toast.error(errorMessages(error).join(" ")); }
  }

  async function editOccurrence(occurrence: RecurringOccurrence) {
    try {
      const transaction = occurrence.transaction ?? await saveOccurrence(occurrence, "planned");
      openEntry(transaction);
    } catch (error) { toast.error(errorMessages(error).join(" ")); }
  }

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-3">
        <PageHeader title="Planejamento" subtitle="Organize receitas e despesas que se repetem." />
        <Button onClick={() => setDialog({ open: true })}><Plus />Nova</Button>
      </div>
      {!data ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
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
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !rule.endedAt && setDialog({ open: true, rule })}>
                        <span className="block truncate font-semibold">{rule.name}</span>
                        <span className="block text-xs text-muted-foreground">{FREQUENCY_LABEL[rule.frequency]} · {account?.name ?? "—"} · {status}</span>
                      </button>
                      <span className={rule.type === "income" ? "font-semibold text-income tabular-nums" : "font-semibold text-expense tabular-nums"}>
                        {formatMoney(rule.amount, rule.currency)}
                      </span>
                      {!rule.endedAt && <>
                        <Button size="icon" variant="ghost" title="Editar" aria-label={`Editar ${rule.name}`} onClick={() => setDialog({ open: true, rule })}><Pencil /></Button>
                        <Button size="icon" variant="ghost" title={rule.active ? "Pausar" : "Retomar"} aria-label={`${rule.active ? "Pausar" : "Retomar"} ${rule.name}`} onClick={() => act(() => setRecurringRuleActive(rule.id, !rule.active), rule.active ? "Recorrência pausada" : "Recorrência retomada")}>{rule.active ? <Pause /> : <Play />}</Button>
                        <Button size="icon" variant="ghost" className="text-destructive" title="Encerrar" aria-label={`Encerrar ${rule.name}`} onClick={() => act(() => endRecurringRule(rule.id, todayISO()), "Recorrência encerrada")}><StopCircle /></Button>
                      </>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-1 text-xl font-semibold">Próximas ocorrências</h2>
            <p className="mb-3 text-sm text-muted-foreground">Janela dos próximos três meses. Previstas não alteram o saldo.</p>
            {!data.occurrences.length ? <p className="text-sm text-muted-foreground">Nenhuma ocorrência prevista.</p> : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card shadow-soft">
                {data.occurrences.map((occurrence) => (
                  <li key={`${occurrence.recurringRuleId}:${occurrence.occurrenceDate}`} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{occurrence.description}</p>
                      <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${occurrence.date}T00:00:00Z`))} · {occurrence.transaction?.status === "confirmed" ? "Confirmado" : occurrence.transaction ? "Editado" : "Previsto"}</p>
                    </div>
                    <span className={occurrence.type === "income" ? "font-semibold text-income tabular-nums" : "font-semibold text-expense tabular-nums"}>{formatMoney(occurrence.amount, occurrence.currency)}</span>
                    {occurrence.transaction?.status !== "confirmed" && <>
                      <Button size="sm" variant="outline" onClick={() => editOccurrence(occurrence)}><Pencil />Editar</Button>
                      <Button size="sm" onClick={() => act(() => saveOccurrence(occurrence, "confirmed"), "Ocorrência confirmada")}><Check />Confirmar</Button>
                    </>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            {[{ title: "Orçamento", text: "Limites mensais por categoria." }, { title: "Fluxo de Caixa", text: "Entradas e saídas mês a mês." }].map((item) => (
              <div key={item.title} className="flex items-center justify-between rounded-lg border bg-card p-4 opacity-70 shadow-soft"><div><p className="font-semibold">{item.title}</p><p className="text-sm text-muted-foreground">{item.text}</p></div><PhaseBadge phase={4} /></div>
            ))}
          </section>
        </div>
      )}
      <RecurringRuleDialog open={dialog.open} rule={dialog.rule} onOpenChange={(open) => setDialog((state) => ({ ...state, open }))} />
    </>
  );
}
