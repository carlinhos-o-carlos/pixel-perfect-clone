import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db";
import { CATEGORY_KIND_LABEL } from "@/domain/categories";
import type { CategoryKind } from "@/domain/types";
import { PageHeader } from "@/ui/Page";

export const Route = createFileRoute("/mais/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias — Finanças" },
      {
        name: "description",
        content: "Categorias de receitas, despesas e finalidades de transferência.",
      },
      { property: "og:title", content: "Categorias — Finanças" },
      { property: "og:description", content: "Categorias de receitas, despesas e transferências." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Categorias,
});

const KINDS: CategoryKind[] = ["income", "expense", "transfer"];

function Categorias() {
  const cats = useLiveQuery(() => getDb().categories.toArray(), []);
  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle="Criar e renomear categorias chega na próxima fase."
      />
      {!cats ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-5">
          {KINDS.map((k) => (
            <section key={k}>
              <h2
                className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {CATEGORY_KIND_LABEL[k]}
              </h2>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
                {cats
                  .filter((c) => c.kind === k && !c.archived)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((c) => (
                    <li key={c.id} className="flex min-h-12 items-center px-4">
                      {c.name}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            "Investimentos" é uma finalidade de transferência: aplicar na corretora não conta como
            despesa.
          </p>
        </div>
      )}
    </>
  );
}
