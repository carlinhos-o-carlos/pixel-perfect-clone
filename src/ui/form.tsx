import type { ReactNode } from "react";
import { ValidationError } from "@/domain/errors";

export const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul
      role="alert"
      className="grid gap-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
    >
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

export function errorMessages(e: unknown): string[] {
  if (e instanceof ValidationError) return e.errors;
  return ["Não foi possível salvar. Tente novamente."];
}

/** Cents → editable text in pt-BR style ("1234,56"). */
export function centsToInput(cents: number, digits = 2): string {
  const neg = cents < 0;
  const s = String(Math.abs(cents)).padStart(digits + 1, "0");
  const out = digits ? `${s.slice(0, -digits)},${s.slice(-digits)}` : s;
  return neg ? `-${out}` : out;
}
