import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Gauge, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readPlanning } from "@/data/planning";
import { deleteBudget } from "@/data/budgets";
import { todayISO } from "@/domain/dates";
import { budgetUsage, monthBounds } from "@/domain/planning";
import { formatMoney } from "@/domain/money";
import type { Budget } from "@/domain/types";
import { BudgetDialog } from "@/ui/BudgetDialog";
import { BudgetMeter } from "@/ui/BudgetMeter";
import { PageHeader, EmptyState } from "@/ui/Page";
import { CurrencyControl, MonthControl, PlanningLinks } from "@/ui/PlanningControls";
import { errorMessages } from "@/ui/form";

export const Route = createFileRoute("/orcamento")({
  head: () => ({
    meta: [
      { title: "Orçamento mensal — Finanças" },
      {
        name: "description",
        content:
          "Limites por categoria, despesas realizadas e valores restantes, com armazenamento local.",
      },
      { property: "og:title", content: "Orçamento mensal — Finanças" },
      { property: "og:description", content: "Acompanhe seu orçamento mensal por categoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orcamento,
});

function Orcamento() {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [currency, setCurrency] = useState("BRL");
  const [editor, setEditor] = useState<{ budget?: Budget } | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const bounds = monthBounds(month);
  const data = useLiveQuery(
    () => readPlanning(bounds?.from ?? today, bounds?.to ?? today),
    [month],
  );
  const usages = data ? budgetUsage(data.budgets, data.transactions, month, today, currency) : [];
  const currencies = [
    ...new Set([
      "BRL",
      ...(data?.accounts.map((a) => a.currency) ?? []),
      ...(data?.budgets.map((b) => b.currency) ?? []),
    ]),
  ];
  return (
    <>
      <PageHeader title="Orçamento" subtitle="Seu mês, categoria por categoria." />
      <PlanningLinks />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <MonthControl month={month} onChange={setMonth} />
        <CurrencyControl currency={currency} currencies={currencies} onChange={setCurrency} />
        <Button className="ml-auto" onClick={() => setEditor({})}>
          <Plus />
          Novo limite
        </Button>
      </div>
      {!data ? (
        <p>Carregando…</p>
      ) : !usages.length ? (
        <EmptyState icon={<Gauge />} title="Nenhum limite neste mês" />
      ) : (
        <div className="grid gap-4">
          {usages.map((usage) => {
            const category = data.categories.find((c) => c.id === usage.budget.categoryId);
            return (
              <article key={usage.budget.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">
                      {category?.name ?? "Categoria removida"}
                      {category?.archived ? " · Arquivada" : ""}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Orçado: {formatMoney(usage.budget.amount, currency, data.settings.locale)}
                    </p>
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${category?.name}`}
                      onClick={() => setEditor({ budget: usage.budget })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${category?.name}`}
                      onClick={() => setDeleting(usage.budget)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <BudgetMeter usage={usage} locale={data.settings.locale} />
              </article>
            );
          })}
        </div>
      )}
      {editor && data && (
        <BudgetDialog
          budget={editor.budget}
          month={month}
          currency={currency}
          categories={data.categories}
          onClose={() => setEditor(null)}
        />
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover orçamento?</DialogTitle>
            <DialogDescription>Os lançamentos e a categoria serão preservados.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteBudget(deleting.id);
                  setDeleting(null);
                  toast.success("Orçamento removido");
                } catch (error) {
                  toast.error(errorMessages(error).join(" "));
                }
              }}
            >
              Remover orçamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
