import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CalendarRange, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjacentMonth } from "@/domain/planning";
import { Field, selectClass } from "./form";

export function PlanningLinks() {
  return (
    <nav aria-label="Visões de planejamento" className="mb-6 flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link to="/orcamento">
          <Gauge />
          Orçamento
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link to="/fluxo-de-caixa">
          <CalendarRange />
          Fluxo de caixa
        </Link>
      </Button>
      <Button variant="ghost" asChild>
        <Link to="/planejamento">Recorrentes</Link>
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
