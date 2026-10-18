import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBudget } from "@/data/budgets";
import { currencyDigits, parseToCents } from "@/domain/money";
import type { Budget, Category } from "@/domain/types";
import { centsToInput, ErrorList, errorMessages, Field, selectClass } from "./form";

export function BudgetDialog({
  budget,
  month,
  currency,
  categories,
  onClose,
}: {
  budget?: Budget | undefined;
  month: string;
  currency: string;
  categories: Category[];
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? "");
  const [amount, setAmount] = useState(
    budget ? centsToInput(budget.amount, currencyDigits(budget.currency)) : "",
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseToCents(amount, budget?.currency ?? currency);
    if (value === null) return setErrors(["Informe um valor válido."]);
    setSaving(true);
    try {
      await saveBudget(
        { categoryId, amount: value, currency: budget?.currency ?? currency, month },
        budget?.id,
      );
      toast.success("Orçamento salvo");
      onClose();
    } catch (error) {
      setErrors(errorMessages(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{budget ? "Editar orçamento" : "Novo orçamento"}</DialogTitle>
          <DialogDescription>
            {month} · {budget?.currency ?? currency}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Categoria" htmlFor="budget-category">
            <select
              id="budget-category"
              className={selectClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={!!budget}
            >
              <option value="">Selecione…</option>
              {categories
                .filter((c) => c.kind === "expense" && (!c.archived || c.id === budget?.categoryId))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? " (arquivada)" : ""}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Limite mensal" htmlFor="budget-amount">
            <Input
              id="budget-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </Field>
          <ErrorList errors={errors} />
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar orçamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
