import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addAssetValuation, deleteAsset, readWealth, setAssetArchived } from "@/data/wealth";
import { formatMoney } from "@/domain/money";
import { ASSET_TYPE_LABEL, currentAssetValue } from "@/domain/wealth";
import type { Asset } from "@/domain/types";
import { EmptyState, PageHeader } from "@/ui/Page";
import { AmountDateDialog, AssetDialog } from "@/ui/WealthDialogs";
import { Card, ConfirmButton } from "@/ui/WealthBits";
import { fmtDate, meta, runAction } from "@/ui/wealthHelpers";

export const Route = createFileRoute("/mais/ativos")({
  head: () => meta("Bens", "Imóveis, veículos e outros bens com valor estimado e histórico."),
  component: Ativos,
});

function Ativos() {
  const w = useLiveQuery(() => readWealth(), []);
  const [edit, setEdit] = useState<{ open: boolean; asset?: Asset | undefined }>({ open: false });
  const [revalue, setRevalue] = useState<Asset | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  if (!w) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const sorted = [...w.assets].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const card = (a: Asset) => {
    const vals = w.valuations.filter((v) => v.assetId === a.id);
    const cur = currentAssetValue(vals);
    return (
      <Card key={a.id} muted={!!a.archived}>
        <div className="flex flex-wrap justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{a.name}</p>
            <p className="text-xs text-muted-foreground">
              {ASSET_TYPE_LABEL[a.assetType]} · {a.currency}
              {a.countedInAccounts && " · já incluído no saldo de conta"}
              {a.archived && " · arquivado"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">
              {cur ? formatMoney(cur.value, a.currency, w.locale) : "—"}
            </p>
            {cur && (
              <p className="text-xs text-muted-foreground">Estimativa em {fmtDate(cur.date)}</p>
            )}
          </div>
        </div>
        {a.notes && <p className="text-sm text-muted-foreground">{a.notes}</p>}
        <div className="flex flex-wrap justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setHistory(history === a.id ? null : a.id)}
          >
            Histórico
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRevalue(a)}>
            Atualizar valor
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit({ open: true, asset: a })}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              runAction(
                () => setAssetArchived(a.id, !a.archived),
                a.archived ? "Bem reativado" : "Bem arquivado",
              )
            }
          >
            {a.archived ? "Reativar" : "Arquivar"}
          </Button>
          <ConfirmButton
            label="Excluir"
            confirm="Excluir bem e histórico"
            onConfirm={() => runAction(() => deleteAsset(a.id), "Bem excluído")}
          />
        </div>
        {history === a.id && (
          <ul className="divide-y rounded-lg border text-sm">
            {[...vals]
              .sort(
                (x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt),
              )
              .map((v) => (
                <li key={v.id} className="flex justify-between px-3 py-2">
                  <span>{fmtDate(v.date)}</span>
                  <span className="tabular-nums">{formatMoney(v.value, a.currency, w.locale)}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    );
  };
  return (
    <>
      <PageHeader
        title="Bens"
        subtitle="Valores estimados. Atualizar um valor cria um novo registro; o histórico e os lançamentos não mudam."
      />
      <Button className="mb-5 h-11" onClick={() => setEdit({ open: true })}>
        <Plus className="h-4 w-4" /> Novo bem
      </Button>
      {!sorted.length ? (
        <EmptyState icon={<Home className="h-6 w-6" />} title="Nenhum bem cadastrado">
          Cadastre imóveis, veículos e outros bens. Saldos de contas já entram no patrimônio.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {[...sorted.filter((a) => !a.archived), ...sorted.filter((a) => a.archived)].map(card)}
        </ul>
      )}
      <AssetDialog
        open={edit.open}
        asset={edit.asset}
        defaultCurrency={w.currency}
        onOpenChange={(open) => setEdit((s) => ({ ...s, open }))}
      />
      <AmountDateDialog
        open={!!revalue}
        onOpenChange={(o) => !o && setRevalue(null)}
        title={`Atualizar valor — ${revalue?.name ?? ""}`}
        description="Zero é aceito. Valores anteriores ficam no histórico."
        currency={revalue?.currency ?? "BRL"}
        amountLabel="Valor estimado"
        onSave={(v, d) => addAssetValuation(revalue!.id, v, d)}
      />
    </>
  );
}
