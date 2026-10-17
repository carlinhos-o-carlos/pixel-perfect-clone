import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/domain/money";
import type { CashFlow } from "@/domain/planning";

export function CashFlowChart({ flow, from, currency, locale }: { flow: CashFlow; from: string; currency: string; locale: string }) {
  const points = [{ date: from, actualBalance: flow.opening, projectedBalance: flow.projectedOpening }, ...flow.days];
  return <div className="mt-6 h-64 w-full min-w-0" role="img" aria-label="Evolução dos saldos realizado e projetado">
    <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} stroke="var(--muted-foreground)" />
      <YAxis width={85} tickFormatter={(v: number) => formatMoney(v, currency, locale)} stroke="var(--muted-foreground)" />
      <Tooltip formatter={(v: number) => formatMoney(v, currency, locale)} contentStyle={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
      <Line name="Saldo realizado" type="stepAfter" dataKey="actualBalance" stroke="var(--income)" dot={false} isAnimationActive={false} />
      <Line name="Saldo projetado" type="stepAfter" dataKey="projectedBalance" stroke="var(--scheduled)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
    </LineChart></ResponsiveContainer>
  </div>;
}