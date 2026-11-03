import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readWealth } from "@/data/wealth";
import { formatMoney } from "@/domain/money";
import { netWorthByCurrency } from "@/domain/wealth";
import { EmptyState, PageHeader } from "@/ui/Page";
import { fmtDate, meta } from "@/ui/WealthBits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mais/patrimonio")({
  head: () => meta("Patrimônio líquido", "Estimativa do seu patrimônio: contas e bens menos dívidas, sem duplicações."),
  component: Patrimonio,
});

function Patrimonio() {
  const w = useLiveQuery(() => readWealth(), []);
  if (!w) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const nw = Object.values(netWorthByCurrency(w));
  const loc = w.locale;
  return (
    <>
      <PageHeader title="Patrimônio líquido" subtitle="Estimativa: ativos considerados − passivos considerados. Não é um valor exato ou garantido." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/mais/ativos">Bens</Link></Button>
        <Button asChild variant="outline"><Link to="/mais/dividas">Dívidas</Link></Button>
        <Button asChild variant="outline"><Link to="/mais/metas">Metas</Link></Button>
      </div>
      {!nw.length ? (
        <EmptyState icon={<Landmark className="h-6 w-6" />} title="Nada para calcular ainda">
          Cadastre contas, bens ou dívidas para ver seu patrimônio estimado.
        </EmptyState>
      ) : (
        <div className="grid gap-5">
          {nw.map((n) => {
            const f = (v: number) => formatMoney(v, n.currency, loc);
            const rows: Array<[string, number, string?]> = [
              ["Saldos positivos de contas", n.accountsPositive],
              ["Bens cadastrados", n.assets],
              ["Pagamentos de dívida a classificar", n.pendingPayments, "Reservados até separar principal e juros."],
            ];
            const liab: Array<[string, number, string?]> = [
              ["Saldos negativos de contas", n.accountsNegative, "Cartões e cheque especial, contados só aqui."],
              ["Dívidas ativas", n.debts],
            ];
            return (
              <section key={n.currency} className="rounded-2xl border bg-card p-5 shadow-soft">
                <p className="text-sm text-muted-foreground">Patrimônio líquido estimado ({n.currency})</p>
                <p className={cn("text-3xl font-semibold tabular-nums", n.netWorth < 0 && "text-expense")}>{f(n.netWorth)}</p>
                {n.lastUpdated && (
                  <p className="mt-1 text-xs text-muted-foreground">Valor mais recente considerado: {fmtDate(n.lastUpdated)}</p>
                )}
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <Block title="Ativos" total={f(n.totalAssets)} rows={rows} f={f} />
                  <Block title="Passivos" total={f(n.totalLiabilities)} rows={liab} f={f} />
                </div>
                {n.assetsExcluded > 0 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {f(n.assetsExcluded)} em bens marcados como “já no saldo de uma conta” não foram somados de novo.
                  </p>
                )}
              </section>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Moedas diferentes não são convertidas nem somadas. Contas arquivadas ficam fora do cálculo. Reservas em metas são apenas separações de dinheiro já existente e não alteram o patrimônio.
          </p>
        </div>
      )}
    </>
  );
}

function Block({ title, total, rows, f }: { title: string; total: string; rows: Array<[string, number, string?]>; f: (v: number) => string }) {
  return (
    <div>
      <div className="flex justify-between border-b pb-2 font-semibold">
        <span>{title}</span>
        <span className="tabular-nums">{total}</span>
      </div>
      <ul className="mt-2 grid gap-2 text-sm">
        {rows.map(([label, v, hint]) => (
          <li key={label}>
            <div className="flex justify-between gap-2">
              <span>{label}</span>
              <span className="tabular-nums">{f(v)}</span>
            </div>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
