import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessages } from "./form";

export async function runAction(fn: () => Promise<unknown>, msg: string) {
  try {
    await fn();
    toast.success(msg);
  } catch (e) {
    toast.error(errorMessages(e)[0]);
  }
}

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

export const fmtDate = (d: string) => d.split("-").reverse().join("/");

export const meta = (title: string, description: string) => ({
  meta: [
    { title: `${title} — Finanças` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — Finanças` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
