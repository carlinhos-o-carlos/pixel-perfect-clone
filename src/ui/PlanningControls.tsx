import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Gauge,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjacentMonth } from "@/domain/planning";
import { Field, selectClass } from "./form";
import { useEntry } from "./EntryContext";

const shortcutClass =
  "h-11 shrink-0 rounded-md px-4 py-2 focus-visible:ring-2 focus-visible:ring-offset-2 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground aria-[current=page]:font-semibold";

export function PlanningLinks({ includeEntries = false }: { includeEntries?: boolean }) {
  const { openNewEntry } = useEntry();
  return (
    <nav
      aria-label="Visões de planejamento"
      className="mb-6 flex w-full min-w-0 flex-wrap items-center justify-center gap-2"
    >
      {includeEntries && (
        <>
          <Button
            variant="outline"
            className={shortcutClass}
            onClick={() => openNewEntry("income")}
          >
            <ArrowDownLeft className="text-income" />
            Receita
          </Button>
          <Button
            variant="outline"
            className={shortcutClass}
            onClick={() => openNewEntry("expense")}
          >
            <ArrowUpRight className="text-expense" />
            Despesa
          </Button>
          <Button
            variant="outline"
            className={shortcutClass}
            onClick={() => openNewEntry("transfer")}
          >
            <ArrowLeftRight />
            Transferência
          </Button>
        </>
      )}
      <Button variant="outline" className={shortcutClass} asChild>
        <Link to="/orcamento" activeOptions={{ exact: true }}>
          <Gauge />
          Orçamento
        </Link>
      </Button>
      <Button variant="outline" className={shortcutClass} asChild>
        <Link to="/fluxo-de-caixa" activeOptions={{ exact: true }}>
          <CalendarRange />
          Fluxo de caixa
        </Link>
      </Button>
      <Button variant="outline" className={shortcutClass} asChild>
        <Link to="/planejamento" activeOptions={{ exact: true }}>
          <Repeat />
          Recorrentes
        </Link>
      </Button>
    </nav>
  );
}

export function MonthControl({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mês anterior"
        onClick={() => onChange(adjacentMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <Field label="Mês" htmlFor="planning-month">
        <Input
          id="planning-month"
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        />
      </Field>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Próximo mês"
        onClick={() => onChange(adjacentMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function CurrencyControl({
  currency,
  currencies,
  onChange,
}: {
  currency: string;
  currencies: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Moeda" htmlFor="planning-currency">
      <select
        className={selectClass}
        id="planning-currency"
        value={currency}
        onChange={(e) => onChange(e.target.value)}
      >
        {currencies.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </Field>
  );
}
