import { createFileRoute } from "@tanstack/react-router";
import { Wallet, ShieldCheck } from "lucide-react";
import { EmptyState, PageHeader } from "@/ui/Page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — Finanças" },
      { name: "description", content: "Resumo do mês: receitas, despesas e saldo, com seus dados só no seu dispositivo." },
      { property: "og:title", content: "Início — Finanças" },
      { property: "og:description", content: "Finanças pessoais privadas, offline e sem cadastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());
  return (
    <>
      <PageHeader title="Olá!" subtitle={`Como vai sua vida financeira em ${month}?`} />
      <EmptyState icon={<Wallet className="h-6 w-6" />} title="Comece cadastrando uma conta">
        Assim que você tiver contas e lançamentos, este resumo mostra o que foi realizado,
        o que está agendado e o que está previsto no mês. Cadastro de contas chega na próxima fase.
      </EmptyState>
      <div className="mt-6 flex gap-3 rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p>
          Sem cadastro e sem servidor: tudo fica guardado neste navegador. Faça backups
          regularmente — limpar os dados do navegador ou perder o aparelho apaga as informações.
        </p>
      </div>
    </>
  );
}
