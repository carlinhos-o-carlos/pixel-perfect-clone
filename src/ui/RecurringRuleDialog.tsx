import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
import { Textarea } from "@/components/ui/textarea";
import { getDb } from "@/data/db";
import { createRecurringRule, updateRecurringRule } from "@/data/recurring";
import { todayISO } from "@/domain/dates";
import { currencyDigits, parseToCents } from "@/domain/money";
import { FREQUENCY_LABEL } from "@/domain/recurring";
import type { Frequency, RecurringRule } from "@/domain/types";
import { cn } from "@/lib/utils";
import { ErrorList, Field, centsToInput, errorMessages, selectClass } from "./form";

const FREQUENCIES = Object.keys(FREQUENCY_LABEL) as Frequency[];

export function RecurringRuleDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: RecurringRule | undefined;
}) {
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const categories = useLiveQuery(() => getDb().categories.toArray(), []);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [day, setDay] = useState(String(new Date().getDate()));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(rule?.type ?? "expense");
    setName(rule?.name ?? "");
    setAmount(rule ? centsToInput(rule.amount, currencyDigits(rule.currency)) : "");
    setAccountId(rule?.accountId ?? "");
    setCategoryId(rule?.categoryId ?? "");
    setStartDate(rule?.startDate ?? todayISO());
    setFrequency(rule?.frequency ?? "monthly");
    setDay(String(rule?.dayOfMonth ?? new Date().getDate()));
    setEndDate(rule?.endDate ?? "");
    setNotes(rule?.notes ?? "");
    setErrors([]);
  }, [open, rule]);

  const usableAccounts = (accounts ?? []).filter((a) => !a.archived || a.id === rule?.accountId);
  const source = usableAccounts.find((a) => a.id === accountId);
  const cats = (categories ?? []).filter(
    (c) => c.kind === type && (!c.archived || c.id === rule?.categoryId),
  );

  useEffect(() => {
    if (open && !accountId && usableAccounts.length) setAccountId(usableAccounts[0]?.id ?? "");
  }, [open, accountId, usableAccounts]);
  useEffect(() => {
    if (categoryId && !cats.some((c) => c.id === categoryId)) setCategoryId("");
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cents = parseToCents(amount, source?.currency ?? "BRL");
    if (cents === null) return setErrors(["Informe um valor válido."]);
    setSaving(true);
    try {
      const draft = {
        name,
        type,
        amount: cents,
        accountId,
        categoryId,
        startDate,
        frequency,
        dayOfMonth: frequency === "monthly" || frequency === "yearly" ? Number(day) : undefined,
        endDate: endDate || undefined,
        notes,
      };
      if (rule) await updateRecurringRule(rule.id, draft);
      else await createRecurringRule(draft);
      toast.success(rule ? "Recorrência atualizada" : "Recorrência criada");
      onOpenChange(false);
    } catch (error) {
      setErrors(errorMessages(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar recorrência" : "Nova recorrência"}</DialogTitle>
          <DialogDescription>Configure uma receita ou despesa que se repete.</DialogDescription>
        </DialogHeader>
        {!accounts || !categories ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div
              role="radiogroup"
              aria-label="Tipo"
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            >
              {(["expense", "income"] as const).map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant="ghost"
                  role="radio"
                  aria-checked={type === item}
                  onClick={() => setType(item)}
                  className={cn(
                    "h-10 text-muted-foreground",
                    type === item && "bg-card shadow-soft",
                    type === item && item === "income" && "text-income",
                    type === item && item === "expense" && "text-expense",
                  )}
                >
                  {item === "income" ? "Receita" : "Despesa"}
                </Button>
              ))}
            </div>
            <Field label="Descrição" htmlFor="rec-name">
              <Input
                id="rec-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Valor${source ? ` (${source.currency})` : ""}`} htmlFor="rec-amount">
                <Input
                  id="rec-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Início" htmlFor="rec-start">
                <Input
                  id="rec-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Conta" htmlFor="rec-account">
              <select
                id="rec-account"
                className={selectClass}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {usableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Categoria" htmlFor="rec-category">
              <select
                id="rec-category"
                className={selectClass}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {cats.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frequência" htmlFor="rec-frequency">
                <select
                  id="rec-frequency"
                  className={selectClass}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Frequency)}
                >
                  {FREQUENCIES.map((item) => (
                    <option key={item} value={item}>
                      {FREQUENCY_LABEL[item]}
                    </option>
                  ))}
                </select>
              </Field>
              {(frequency === "monthly" || frequency === "yearly") && (
                <Field label="Dia de vencimento" htmlFor="rec-day">
                  <Input
                    id="rec-day"
                    type="number"
                    min={1}
                    max={31}
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <Field label="Término (opcional)" htmlFor="rec-end">
              <Input
                id="rec-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <Field label="Observações (opcional)" htmlFor="rec-notes">
              <Textarea
                id="rec-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <ErrorList errors={errors} />
            <Button type="submit" disabled={saving || !usableAccounts.length} className="h-11">
              {saving ? "Salvando…" : "Salvar recorrência"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
