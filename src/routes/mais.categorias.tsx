import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDb } from "@/data/db";
import { createCategory, deleteCategory, renameCategory, setCategoryArchived } from "@/data/categories";
import { CATEGORY_KIND_LABEL } from "@/domain/categories";
import type { Category, CategoryKind } from "@/domain/types";
import { errorMessages } from "@/ui/form";
import { PageHeader } from "@/ui/Page";

export const Route = createFileRoute("/mais/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias — Finanças" },
      { name: "description", content: "Categorias de receitas, despesas e finalidades de transferência." },
      { property: "og:title", content: "Categorias — Finanças" },
      { property: "og:description", content: "Categorias de receitas, despesas e transferências." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Categorias,
});

const KINDS: CategoryKind[] = ["income", "expense", "transfer"];

async function run(fn: () => Promise<unknown>, msg: string): Promise<boolean> {
  try {
    await fn();
    toast.success(msg);
    return true;
  } catch (e) {
    toast.error(errorMessages(e)[0]);
    return false;
  }
}

function Categorias() {
  const data = useLiveQuery(async () => {
    const db = getDb();
    const [cats, txs] = await Promise.all([db.categories.toArray(), db.transactions.toArray()]);
    return { cats, used: new Set(txs.map((t) => t.categoryId)) };
  }, []);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <>
      <PageHeader title="Categorias" subtitle="Toque no nome para renomear. Categorias arquivadas não aparecem em novos lançamentos." />
      {!data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-6">
          {KINDS.map((k) => (
            <KindSection key={k} kind={k} cats={data.cats.filter((c) => c.kind === k && (showArchived || !c.archived))} used={data.used} />
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Mostrar arquivadas
          </label>
          <p className="text-xs text-muted-foreground">
            "Investimentos" é uma finalidade de transferência: aplicar na corretora não conta como despesa.
          </p>
        </div>
      )}
    </>
  );
}

function KindSection({ kind, cats, used }: { kind: CategoryKind; cats: Category[]; used: Set<string | undefined> }) {
  const [name, setName] = useState("");
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
        {CATEGORY_KIND_LABEL[kind]}
      </h2>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
        {cats.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => (
          <CategoryRow key={c.id} c={c} used={used.has(c.id)} />
        ))}
        <li>
          <form
            className="flex gap-2 p-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => createCategory({ name, kind }), "Categoria criada")) setName("");
            }}
          >
            <Input aria-label={`Nova categoria de ${CATEGORY_KIND_LABEL[kind]}`} placeholder="Nova categoria…" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="h-10" />
            <Button type="submit" variant="secondary" disabled={!name.trim()}>Adicionar</Button>
          </form>
        </li>
      </ul>
    </section>
  );
}

function CategoryRow({ c, used }: { c: Category; used: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  return (
    <li className="flex min-h-12 items-center gap-2 px-4 py-1">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => renameCategory(c.id, name), "Categoria renomeada")) setEditing(false);
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} className="h-9" aria-label="Nome da categoria" />
          <Button type="submit" size="sm">Salvar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setName(c.name); setEditing(false); }}>Cancelar</Button>
        </form>
      ) : (
        <>
          <button type="button" className="flex-1 text-left" onClick={() => setEditing(true)}>
            <span className={c.archived ? "text-muted-foreground line-through" : ""}>{c.name}</span>
          </button>
          <Button size="sm" variant="ghost" onClick={() => run(() => setCategoryArchived(c.id, !c.archived), c.archived ? "Categoria reativada" : "Categoria arquivada")}>
            {c.archived ? "Reativar" : "Arquivar"}
          </Button>
          {!c.system && !used && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => deleteCategory(c.id), "Categoria excluída")}>Excluir</Button>
          )}
        </>
      )}
    </li>
  );
}
