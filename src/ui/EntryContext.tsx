import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
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
import { createTransaction, deleteTransaction, updateTransaction } from "@/data/transactions";
import { categoryKindFor } from "@/domain/categories";
import { todayISO } from "@/domain/dates";
import { currencyDigits, parseToCents } from "@/domain/money";
import { ENTRY_TYPE_LABEL, type EntryType } from "@/domain/transactions";
import type { Transaction, TransactionStatus } from "@/domain/types";
import { ErrorList, Field, centsToInput, errorMessages, selectClass } from "./form";
import { cn } from "@/lib/utils";

interface EntryCtx {
  openEntry: (tx?: Transaction) => void;
}
const Ctx = createContext<EntryCtx>({ openEntry: () => {} });
export const useEntry = () => useContext(Ctx);

export function EntryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; tx?: Transaction | undefined }>({
    open: false,
  });
  const openEntry = useCallback((tx?: Transaction) => setState({ open: true, tx }), []);
  const value = useMemo(() => ({ openEntry }), [openEntry]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{state.tx ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            <DialogDescription>
              Receita, despesa ou transferência entre suas contas.
            </DialogDescription>
          </DialogHeader>
          {state.open && <EntryForm tx={state.tx} onDone={() => setState({ open: false })} />}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

const TYPES: EntryType[] = ["expense", "income", "transfer"];

function EntryForm({ tx, onDone }: { tx?: Transaction; onDone: () => void }) {
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const categories = useLiveQuery(() => getDb().categories.toArray(), []);
  const [type, setType] = useState<EntryType>((tx?.type as EntryType) ?? "expense");
  const [status, setStatus] = useState<TransactionStatus>(tx?.status ?? "confirmed");
  const [date, setDate] = useState(tx?.date ?? todayISO());
  const [amount, setAmount] = useState(
    tx ? centsToInput(tx.amount, currencyDigits(tx.currency)) : "",
  );
  const [accountId, setAccountId] = useState(tx?.accountId ?? "");
  const [destId, setDestId] = useState(tx?.destinationAccountId ?? "");
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? "");
  const [description, setDescription] = useState(tx?.description ?? "");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Usable accounts: active ones, plus whatever this entry already uses.
  const usable = (accounts ?? [])
    .filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.destinationAccountId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const source = usable.find((a) => a.id === accountId);
  const kind = categoryKindFor(type);
  const cats = (categories ?? [])
    .filter((c) => c.kind === kind && (!c.archived || c.id === tx?.categoryId))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    if (!accountId && usable.length) setAccountId(usable[0]!.id);
  }, [accountId, usable]);
  useEffect(() => {
    if (categoryId && categories && !cats.some((c) => c.id === categoryId)) setCategoryId("");
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!accounts || !categories) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!usable.length)
    return (
      <div className="grid gap-3 text-sm">
        <p>Antes de lançar, cadastre pelo menos uma conta.</p>
        <Button asChild onClick={onDone}>
          <Link to="/mais/contas">Cadastrar conta</Link>
        </Button>
      </div>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseToCents(amount, source?.currency ?? "BRL");
    if (cents === null) return setErrors(["Informe um valor válido."]);
    setSaving(true);
    const draft = {
      type,
      status,
      date,
      amount: cents,
      accountId,
      destinationAccountId: type === "transfer" ? destId : undefined,
      categoryId: categoryId || undefined,
      description,
      notes,
    };
    try {
      if (tx) await updateTransaction(tx.id, draft);
      else await createTransaction(draft);
      toast.success(tx ? "Lançamento atualizado" : "Lançamento salvo");
      onDone();
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!tx) return;
    try {
      await deleteTransaction(tx.id);
      toast.success("Lançamento excluído");
      onDone();
    } catch (err) {
      setErrors(errorMessages(err));
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div
        role="radiogroup"
        aria-label="Tipo"
        className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
      >
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={cn(
              "min-h-10 rounded-lg text-sm font-medium text-muted-foreground",
              type === t && "bg-card shadow-soft",
              type === t && t === "income" && "text-income",
              type === t && t === "expense" && "text-expense",
              type === t && t === "transfer" && "text-primary",
            )}
          >
            {ENTRY_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Valor${source ? ` (${source.currency})` : ""}`} htmlFor="tx-amount">
          <Input
            id="tx-amount"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus={!tx}
          />
        </Field>
        <Field label="Data" htmlFor="tx-date">
          <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Descrição" htmlFor="tx-desc">
        <Input
          id="tx-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={120}
        />
      </Field>
      <div className={cn("grid gap-3", type === "transfer" && "grid-cols-2")}>
        <Field label={type === "transfer" ? "De" : "Conta"} htmlFor="tx-acc">
          <select
            id="tx-acc"
            className={selectClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>
        {type === "transfer" && (
          <Field label="Para" htmlFor="tx-dest">
            <select
              id="tx-dest"
              className={selectClass}
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {usable
                .filter((a) => a.id !== accountId && a.currency === source?.currency)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
      <Field label={type === "transfer" ? "Finalidade (opcional)" : "Categoria"} htmlFor="tx-cat">
        <select
          id="tx-cat"
          className={selectClass}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">{type === "transfer" ? "Sem finalidade" : "Selecione…"}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--planned)]"
          checked={status === "planned"}
          onChange={(e) => setStatus(e.target.checked ? "planned" : "confirmed")}
        />
        <span>
          <strong>Previsto</strong> — ainda não aconteceu; não altera o saldo realizado.
        </span>
      </label>
      <Field label="Observações (opcional)" htmlFor="tx-notes">
        <Textarea id="tx-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorList errors={errors} />
      <Button type="submit" disabled={saving} className="h-11">
        {saving ? "Salvando…" : "Salvar"}
      </Button>
      {tx && (
        <Button
          type="button"
          variant={confirmDelete ? "destructive" : "ghost"}
          className="h-11 text-destructive data-[c=true]:text-destructive-foreground"
          data-c={confirmDelete}
          onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
        >
          {confirmDelete ? "Confirmar exclusão" : "Excluir lançamento"}
        </Button>
      )}
    </form>
  );
}
