import { Link } from "@tanstack/react-router";
import { Home, ListOrdered, Plus, CalendarRange, Menu } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Início", icon: Home },
  { to: "/lancamentos", label: "Lançamentos", icon: ListOrdered },
  { to: "/planejamento", label: "Planejamento", icon: CalendarRange },
  { to: "/mais", label: "Mais", icon: Menu },
] as const;

function NewEntryButton({ compact = false }: { compact?: boolean }) {
  // Transaction entry arrives in Phase 2; the button is visible but disabled.
  return (
    <button
      type="button"
      disabled
      title="Novo lançamento — disponível na próxima fase"
      aria-label="Novo lançamento (em breve)"
      className={
        compact
          ? "flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-fab disabled:opacity-60"
          : "flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-fab disabled:opacity-60"
      }
    >
      <Plus className="h-5 w-5" />
      {!compact && "Novo lançamento"}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-5 md:flex md:sticky md:top-0 md:h-screen">
        <div className="font-display text-2xl font-semibold text-primary">Finanças</div>
        <NewEntryButton />
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground hover:bg-sidebar-accent"
              activeProps={{
                className: "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
              }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto text-xs text-muted-foreground">
          Seus dados ficam apenas neste dispositivo.
        </p>
      </aside>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">
        {children}
      </main>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur md:hidden"
      >
        {NAV.slice(0, 2).map((n) => (
          <MobileLink key={n.to} {...n} />
        ))}
        <div className="flex justify-center">
          <NewEntryButton compact />
        </div>
        {NAV.slice(2).map((n) => (
          <MobileLink key={n.to} {...n} />
        ))}
      </nav>
    </div>
  );
}

function MobileLink({ to, label, icon: Icon }: (typeof NAV)[number]) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/" }}
      className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
      activeProps={{ className: "font-semibold text-primary" }}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
