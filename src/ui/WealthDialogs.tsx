import { useEffect, useState, type ReactNode } from "react";
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
import { SUPPORTED_CURRENCIES } from "@/domain/accounts";
import { todayISO } from "@/domain/dates";
import { currencyDigits, parseToCents } from "@/domain/money";
import type { Account, Asset, AssetType, Debt, DebtType, Goal } from "@/domain/types";
import { ASSET_TYPE_LABEL, DEBT_TYPE_LABEL, GOAL_TYPE_LABEL } from "@/domain/wealth";
import {
  createAsset,
  createDebt,
  createGoal,
  updateAsset,
  updateDebt,
  updateGoal,
} from "@/data/wealth";
import { ErrorList, Field, centsToInput, errorMessages, selectClass } from "./form";

function Shell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function useSubmit(onDone: () => void) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  async function run(fn: () => Promise<unknown>, msg: string) {
    if (saving) return;
    setSaving(true);
    try {
      await fn();
      toast.success(msg);
      onDone();
    } catch (e) {
      setErrors(errorMessages(e));
    } finally {
      setSaving(false);
    }
  }
  return { errors, setErrors, saving, run };
}

function CurrencySelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const list = SUPPORTED_CURRENCIES.includes(value)
    ? SUPPORTED_CURRENCIES
    : [value, ...SUPPORTED_CURRENCIES];
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {list.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}

const Actions = ({ saving, onCancel }: { saving: boolean; onCancel: () => void }) => (
  <div className="flex justify-end gap-2">
    <Button type="button" variant="ghost" onClick={onCancel}>
      Cancelar
    </Button>
    <Button type="submit" disabled={saving}>
      {saving ? "Salvando…" : "Salvar"}
    </Button>
  </div>
);

/* ---------- Amount + date (valuation, debt balance, contribution) ---------- */

export function AmountDateDialog({
  open,
  onOpenChange,
  title,
  description,
  currency,
  amountLabel,
  allowNegative = false,
  initial,
  withNote = false,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  currency: string;
  amountLabel: string;
  allowNegative?: boolean;
  initial?: { amount: number; date: string; note?: string | undefined } | undefined;
  withNote?: boolean;
  onSave: (amount: number, date: string, note?: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const s = useSubmit(() => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setAmount(initial ? centsToInput(initial.amount, currencyDigits(currency)) : "");
    setDate(initial?.date ?? todayISO());
    setNote(initial?.note ?? "");
    s.setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Shell open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const c = parseToCents(amount, currency);
          if (c === null || (!allowNegative && c < 0)) return s.setErrors(["Valor inválido."]);
          void s.run(() => onSave(c, date, note), "Salvo");
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${amountLabel} (${currency})`} htmlFor="ad-amount">
            <Input
              id="ad-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Data de referência" htmlFor="ad-date">
            <Input
              id="ad-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        {withNote && (
          <Field label="Observação (opcional)" htmlFor="ad-note">
            <Input
              id="ad-note"
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        )}
        <ErrorList errors={s.errors} />
        <Actions saving={s.saving} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ---------- Asset ---------- */

export function AssetDialog({
  open,
  onOpenChange,
  asset,
  defaultCurrency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  asset?: Asset | undefined;
  defaultCurrency: string;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("real_estate");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [counted, setCounted] = useState(false);
  const s = useSubmit(() => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setName(asset?.name ?? "");
    setType(asset?.assetType ?? "real_estate");
    setCurrency(asset?.currency ?? defaultCurrency);
    setValue("");
    setDate(todayISO());
    setNotes(asset?.notes ?? "");
    setCounted(asset?.countedInAccounts ?? false);
    s.setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset]);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={asset ? "Editar bem" : "Novo bem"}
      description="Cadastre imóveis, veículos e outros bens. Saldos de contas já entram no patrimônio automaticamente."
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const input = { name, assetType: type, currency, notes, countedInAccounts: counted };
          if (asset) return void s.run(() => updateAsset(asset.id, input), "Bem atualizado");
          const c = parseToCents(value, currency);
          if (c === null) return s.setErrors(["Informe um valor estimado válido."]);
          void s.run(() => createAsset(input, c, date), "Bem cadastrado");
        }}
      >
        <Field label="Nome" htmlFor="as-name">
          <Input
            id="as-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="as-type">
            <select
              id="as-type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as AssetType)}
            >
              {Object.entries(ASSET_TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moeda" htmlFor="as-cur">
            <CurrencySelect id="as-cur" value={currency} onChange={setCurrency} />
          </Field>
        </div>
        {!asset && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor estimado" htmlFor="as-value">
              <Input
                id="as-value"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Field label="Data de referência" htmlFor="as-date">
              <Input
                id="as-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={counted}
            onChange={(e) => setCounted(e.target.checked)}
          />
          <span>
            Este valor já está no saldo de uma conta (ex.: investimento em corretora). Ele será
            listado, mas não somado de novo ao patrimônio.
          </span>
        </label>
        <Field label="Observações (opcional)" htmlFor="as-notes">
          <Textarea
            id="as-notes"
            value={notes}
            maxLength={300}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <ErrorList errors={s.errors} />
        <Actions saving={s.saving} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ---------- Debt ---------- */

export function DebtDialog({
  open,
  onOpenChange,
  debt,
  accounts,
  defaultCurrency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  debt?: Debt | undefined;
  accounts: Account[];
  defaultCurrency: string;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DebtType>("loan");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(todayISO());
  const [rate, setRate] = useState("");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [dueDay, setDueDay] = useState("");
  const [notes, setNotes] = useState("");
  const [proceeds, setProceeds] = useState(false);
  const [accountId, setAccountId] = useState("");
  const s = useSubmit(() => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setName(debt?.name ?? "");
    setType(debt?.debtType ?? "loan");
    setCurrency(debt?.currency ?? defaultCurrency);
    setBalance("");
    setDate(todayISO());
    setRate(debt?.interestRateBp !== undefined ? centsToInput(debt.interestRateBp) : "");
    setPeriod(debt?.interestPeriod ?? "monthly");
    setDueDay(debt?.dueDay ? String(debt.dueDay) : "");
    setNotes(debt?.notes ?? "");
    setProceeds(false);
    setAccountId("");
    s.setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debt]);
  const eligible = accounts.filter(
    (a) => !a.archived && a.currency === currency && a.kind !== "credit_card",
  );
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={debt ? "Editar dívida" : "Nova dívida"}
      description="Cartões de crédito e cheque especial em conta já aparecem pelo saldo negativo da conta: não cadastre-os aqui."
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          let interestRateBp: number | undefined;
          if (rate.trim()) {
            const r = parseToCents(rate, "BRL");
            if (r === null || r < 0) return s.setErrors(["Taxa de juros inválida."]);
            interestRateBp = r;
          }
          let due: number | undefined;
          if (dueDay.trim()) {
            due = Number(dueDay);
            if (!Number.isInteger(due)) return s.setErrors(["Dia de vencimento inválido."]);
          }
          const input = {
            name,
            debtType: type,
            currency,
            interestRateBp,
            interestPeriod: interestRateBp !== undefined ? period : undefined,
            dueDay: due,
            notes,
          };
          if (debt) return void s.run(() => updateDebt(debt.id, input), "Dívida atualizada");
          const c = parseToCents(balance, currency);
          if (c === null) return s.setErrors(["Informe um saldo devedor válido."]);
          if (proceeds && !accountId)
            return s.setErrors(["Selecione a conta que recebeu o valor."]);
          void s.run(
            () => createDebt(input, c, date, proceeds ? { accountId } : undefined),
            "Dívida cadastrada",
          );
        }}
      >
        <Field label="Nome" htmlFor="dt-name">
          <Input
            id="dt-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="dt-type">
            <select
              id="dt-type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as DebtType)}
            >
              {Object.entries(DEBT_TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moeda" htmlFor="dt-cur">
            <CurrencySelect id="dt-cur" value={currency} onChange={setCurrency} />
          </Field>
        </div>
        {!debt && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saldo devedor atual" htmlFor="dt-bal">
              <Input
                id="dt-bal"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </Field>
            <Field label="Data de referência" htmlFor="dt-date">
              <Input
                id="dt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Juros (%)" htmlFor="dt-rate">
            <Input
              id="dt-rate"
              inputMode="decimal"
              placeholder="1,99"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field label="Período" htmlFor="dt-period">
            <select
              id="dt-period"
              className={selectClass}
              value={period}
              onChange={(e) => setPeriod(e.target.value as "monthly" | "yearly")}
            >
              <option value="monthly">ao mês</option>
              <option value="yearly">ao ano</option>
            </select>
          </Field>
          <Field label="Vencimento (dia)" htmlFor="dt-due">
            <Input
              id="dt-due"
              inputMode="numeric"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            />
          </Field>
        </div>
        {!debt && (
          <div className="grid gap-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={proceeds}
                onChange={(e) => setProceeds(e.target.checked)}
              />
              <span>
                Registrar entrada do valor na conta (não conta como receita). Deixe desmarcado se
                você já lançou esse dinheiro.
              </span>
            </label>
            {proceeds && (
              <select
                aria-label="Conta que recebeu o valor"
                className={selectClass}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Selecione a conta</option>
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <Field label="Observações (opcional)" htmlFor="dt-notes">
          <Textarea
            id="dt-notes"
            value={notes}
            maxLength={300}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <ErrorList errors={s.errors} />
        <Actions saving={s.saving} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ---------- Payment / allocation ---------- */

export function PaymentDialog({
  open,
  onOpenChange,
  currency,
  accounts,
  fixedAmount,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: string;
  accounts: Account[];
  /** Set when classifying an existing pending payment. */
  fixedAmount?: number | undefined;
  onSave: (p: {
    accountId: string;
    date: string;
    amount: number;
    split?: { principal: number; interest: number; fees: number } | undefined;
  }) => Promise<unknown>;
}) {
  const classify = fixedAmount !== undefined;
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [known, setKnown] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [fees, setFees] = useState("");
  const s = useSubmit(() => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setAccountId("");
    setDate(todayISO());
    setAmount(classify ? centsToInput(fixedAmount, currencyDigits(currency)) : "");
    setKnown(classify);
    setPrincipal("");
    setInterest("");
    setFees("");
    s.setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const eligible = accounts.filter((a) => !a.archived && a.currency === currency);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={classify ? "Classificar pagamento" : "Registrar pagamento"}
      description="Só o principal reduz a dívida. Se você ainda não sabe quanto foi juros, deixe o pagamento a classificar."
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const total = classify ? fixedAmount : parseToCents(amount, currency);
          if (total === null || total <= 0) return s.setErrors(["Valor pago inválido."]);
          let split: { principal: number; interest: number; fees: number } | undefined;
          if (known) {
            const [p, i, f] = [principal, interest, fees].map((v) =>
              parseToCents(v || "0", currency),
            );
            if (p === null || i === null || f === null) return s.setErrors(["Valores inválidos."]);
            split = { principal: p, interest: i, fees: f };
          }
          void s.run(() => onSave({ accountId, date, amount: total, split }), "Pagamento salvo");
        }}
      >
        {!classify && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Conta de pagamento" htmlFor="pm-acc">
                <select
                  id="pm-acc"
                  className={selectClass}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {eligible.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data" htmlFor="pm-date">
                <Input
                  id="pm-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label={`Valor pago (${currency})`} htmlFor="pm-amount">
              <Input
                id="pm-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={known}
                onChange={(e) => setKnown(e.target.checked)}
              />
              Sei quanto foi principal, juros e encargos
            </label>
          </>
        )}
        {known && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Principal" htmlFor="pm-p">
              <Input
                id="pm-p"
                inputMode="decimal"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </Field>
            <Field label="Juros" htmlFor="pm-i">
              <Input
                id="pm-i"
                inputMode="decimal"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              />
            </Field>
            <Field label="Encargos" htmlFor="pm-f">
              <Input
                id="pm-f"
                inputMode="decimal"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
            </Field>
          </div>
        )}
        <ErrorList errors={s.errors} />
        <Actions saving={s.saving} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ---------- Goal ---------- */

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  defaultCurrency,
  hasAllocations,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal?: Goal | undefined;
  defaultCurrency: string;
  hasAllocations?: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Goal["goalType"]>("emergency_fund");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const s = useSubmit(() => onOpenChange(false));
  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setDescription(goal?.description ?? "");
    setType(goal?.goalType ?? "emergency_fund");
    setCurrency(goal?.currency ?? defaultCurrency);
    setTarget(goal ? centsToInput(goal.target, currencyDigits(goal.currency)) : "");
    setDate(goal?.targetDate ?? "");
    s.setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal]);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "Editar meta" : "Nova meta"}
      description="Contribuições reservam dinheiro que já está nas suas contas; não são receitas nem novos bens."
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const t = parseToCents(target, currency);
          if (t === null) return s.setErrors(["Informe um valor-alvo válido."]);
          const input = {
            name,
            description,
            goalType: type,
            currency,
            target: t,
            targetDate: date || undefined,
          };
          void s.run(
            () => (goal ? updateGoal(goal.id, input) : createGoal(input)),
            goal ? "Meta atualizada" : "Meta criada",
          );
        }}
      >
        <Field label="Nome" htmlFor="gl-name">
          <Input
            id="gl-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="gl-type">
            <select
              id="gl-type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as Goal["goalType"])}
            >
              {Object.entries(GOAL_TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Moeda" htmlFor="gl-cur">
            <CurrencySelect
              id="gl-cur"
              value={currency}
              onChange={setCurrency}
              disabled={hasAllocations}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor-alvo" htmlFor="gl-target">
            <Input
              id="gl-target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>
          <Field label="Data-alvo (opcional)" htmlFor="gl-date">
            <Input
              id="gl-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Descrição (opcional)" htmlFor="gl-desc">
          <Textarea
            id="gl-desc"
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <ErrorList errors={s.errors} />
        <Actions saving={s.saving} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}
