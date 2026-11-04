import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Two-step destructive button: first click asks, second confirms. */
export function ConfirmButton({
  label,
  confirm,
  onConfirm,
}: {
  label: string;
  confirm: string;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  return asking ? (
    <span className="flex gap-1">
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirm}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAsking(true)}>
      {label}
    </Button>
  );
}

export function Card({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <li
      className={`grid gap-3 rounded-2xl border bg-card p-4 shadow-soft ${muted ? "opacity-75" : ""}`}
    >
      {children}
    </li>
  );
}
