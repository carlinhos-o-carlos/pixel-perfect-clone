import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { PageHeader, PhaseBadge } from "@/ui/Page";

const SOON = [
  { title: "Contas", phase: 2 },
  { title: "Patrimônio", phase: 5 },
  { title: "Dívidas", phase: 5 },
  { title: "Objetivos", phase: 5 },
  { title: "Ferramentas", phase: 6 },
];

export const Route = createFileRoute("/mais/")({
  head: () => ({
    meta: [
      { title: "Mais — Finanças" },
      {
        name: "description",
        content: "Contas, patrimônio, objetivos, ferramentas e configurações.",
      },
      { property: "og:title", content: "Mais — Finanças" },
      { property: "og:description", content: "Contas, patrimônio, objetivos e configurações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Mais" />
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
        {(
          [
            { to: "/mais/categorias", title: "Categorias" },
            { to: "/mais/configuracoes", title: "Configurações" },
          ] as const
        ).map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex min-h-14 items-center justify-between px-4 hover:bg-muted"
          >
            <span className="font-medium">{l.title}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
        {SOON.map((s) => (
          <div
            key={s.title}
            className="flex min-h-14 items-center justify-between px-4 text-muted-foreground"
          >
            <span>{s.title}</span>
            <PhaseBadge phase={s.phase} />
          </div>
        ))}
      </div>
    </>
  ),
});
