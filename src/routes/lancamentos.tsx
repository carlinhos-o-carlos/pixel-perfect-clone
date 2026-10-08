import { createFileRoute } from "@tanstack/react-router";
import { ListOrdered } from "lucide-react";
import { EmptyState, PageHeader } from "@/ui/Page";

export const Route = createFileRoute("/lancamentos")({
  head: () => ({
    meta: [
      { title: "Lançamentos — Finanças" },
      { name: "description", content: "Receitas, despesas e transferências do mês." },
      { property: "og:title", content: "Lançamentos — Finanças" },
      { property: "og:description", content: "Receitas, despesas e transferências do mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Lançamentos" />
      <EmptyState icon={<ListOrdered className="h-6 w-6" />} title="Nenhum lançamento ainda">
        O registro de receitas, despesas e transferências chega na próxima fase.
      </EmptyState>
    </>
  ),
});
