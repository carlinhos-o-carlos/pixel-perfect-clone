import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PhaseBadge } from "@/ui/Page";

const ITEMS = [
  { title: "Recorrentes", text: "Salário, aluguel, assinaturas.", phase: 3 },
  { title: "Orçamento", text: "Limites mensais por categoria.", phase: 4 },
  { title: "Fluxo de Caixa", text: "Entradas e saídas mês a mês.", phase: 4 },
];

export const Route = createFileRoute("/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento — Finanças" },
      { name: "description", content: "Orçamento, fluxo de caixa e lançamentos recorrentes." },
      { property: "og:title", content: "Planejamento — Finanças" },
      { property: "og:description", content: "Orçamento, fluxo de caixa e recorrentes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Planejamento" />
      <ul className="grid gap-3">
        {ITEMS.map((i) => (
          <li key={i.title} className="flex items-center justify-between rounded-2xl border bg-card p-4 opacity-70 shadow-soft">
            <div>
              <p className="font-semibold">{i.title}</p>
              <p className="text-sm text-muted-foreground">{i.text}</p>
            </div>
            <PhaseBadge phase={i.phase} />
          </li>
        ))}
      </ul>
    </>
  ),
});
