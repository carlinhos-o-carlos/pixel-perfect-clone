import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDb } from "@/data/db";
import { updateSettings } from "@/data/settings";
import { formatMoney } from "@/domain/money";
import { PageHeader } from "@/ui/Page";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/mais/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Finanças" },
      { name: "description", content: "Moeda padrão, armazenamento local e privacidade." },
      { property: "og:title", content: "Configurações — Finanças" },
      { property: "og:description", content: "Moeda padrão, armazenamento local e privacidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracoes,
});

const CURRENCIES = ["BRL", "USD", "EUR", "GBP"];

function Configuracoes() {
  const settings = useLiveQuery(() => getDb().settings.get("app"), []);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  async function requestPersist() {
    const ok = (await navigator.storage?.persist?.()) ?? false;
    setPersisted(ok);
    toast(
      ok
        ? "Armazenamento persistente ativado."
        : "O navegador não concedeu armazenamento persistente.",
    );
  }

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4">
        <section className="rounded-2xl border bg-card p-4 shadow-soft">
          <Label htmlFor="currency">Moeda padrão</Label>
          <Select
            value={settings?.displayCurrency ?? ""}
            onValueChange={async (v) => {
              await updateSettings({ displayCurrency: v });
              toast("Moeda padrão atualizada.");
            }}
          >
            <SelectTrigger id="currency" className="mt-2 h-12">
              <SelectValue placeholder="Carregando…" />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c} — exemplo {formatMoney(123456, c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Define o padrão para novos registros e a formatação. Não converte valores entre moedas:
            totais são sempre mostrados separados por moeda.
          </p>
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-soft">
          <h2 className="font-semibold">Armazenamento local</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Seus dados ficam só neste navegador. O backup em arquivo chega em uma fase futura; até
            lá, evite limpar os dados do navegador.
          </p>
          <p className="mt-3 text-sm">
            Persistente:{" "}
            <strong>{persisted === null ? "desconhecido" : persisted ? "sim" : "não"}</strong>
          </p>
          {!persisted && (
            <button
              type="button"
              onClick={requestPersist}
              className="mt-3 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-accent"
            >
              Pedir armazenamento persistente
            </button>
          )}
        </section>
      </div>
    </>
  );
}
