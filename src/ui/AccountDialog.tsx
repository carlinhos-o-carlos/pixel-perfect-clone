import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCOUNT_KIND_LABEL, SUPPORTED_CURRENCIES } from "@/domain/accounts";
import { currencyDigits, parseToCents } from "@/domain/money";
import type { Account, AccountKind } from "@/domain/types";
import { createAccount, updateAccount } from "@/data/accounts";
import { ErrorList, Field, centsToInput, errorMessages, selectClass } from "./form";

export function AccountDialog({
  open,
  onOpenChange,
  account,
  defaultCurrency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: Account;
  defaultCurrency: string;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [opening, setOpening] = useState("0");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setKind(account?.kind ?? "checking");
    setCurrency(account?.currency ?? defaultCurrency);
    setOpening(account ? centsToInput(account.openingBalance, currencyDigits(account.currency)) : "0");
    setErrors([]);
  }, [open, account, defaultCurrency]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseToCents(opening || "0", currency);
    if (cents === null) return setErrors(["Saldo inicial inválido."]);
    setSaving(true);
    try {
      const input = { name, kind, currency, openingBalance: cents };
      if (account) await updateAccount(account.id, input);
      else await createAccount(input);
      toast.success(account ? "Conta atualizada" : "Conta criada");
      onOpenChange(false);
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSaving(false);
    }
  }

  const currencies = SUPPORTED_CURRENCIES.includes(currency) ? SUPPORTED_CURRENCIES : [currency, ...SUPPORTED_CURRENCIES];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            Para cartão de crédito ou cheque especial, use saldo negativo para o valor devido.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Nome" htmlFor="acc-name">
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" htmlFor="acc-kind">
              <select id="acc-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
                {Object.entries(ACCOUNT_KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Moeda" htmlFor="acc-cur">
              <select id="acc-cur" className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Saldo inicial" htmlFor="acc-open">
            <Input id="acc-open" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" />
          </Field>
          <ErrorList errors={errors} />
          <Button type="submit" disabled={saving} className="h-11">
            {saving ? "Salvando…" : "Salvar conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
