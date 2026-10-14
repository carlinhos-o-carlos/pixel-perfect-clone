import { getDb, newId, type FinanceDB } from "./db";
import { assertValid, ValidationError } from "@/domain/errors";
import type { Category, CategoryKind } from "@/domain/types";

function nameErrors(name: string, kind: CategoryKind, all: Category[], selfId?: string): string[] {
  const n = name.trim();
  if (!n) return ["Informe o nome da categoria."];
  if (n.length > 40) return ["O nome pode ter no máximo 40 caracteres."];
  const dup = all.some(
    (c) =>
      c.id !== selfId &&
      c.kind === kind &&
      c.name.trim().toLocaleLowerCase("pt-BR") === n.toLocaleLowerCase("pt-BR"),
  );
  return dup ? ["Já existe uma categoria com esse nome."] : [];
}

export async function createCategory(
  input: { name: string; kind: CategoryKind },
  db: FinanceDB = getDb(),
): Promise<Category> {
  if (!["income", "expense", "transfer"].includes(input.kind))
    throw new ValidationError(["Tipo de categoria inválido."]);
  return db.transaction("rw", db.categories, async () => {
    const all = await db.categories.toArray();
    assertValid(nameErrors(input.name, input.kind, all));
    const now = new Date().toISOString();
    const cat: Category = {
      id: newId(),
      key: null,
      name: input.name.trim(),
      kind: input.kind,
      system: false,
      archived: false,
      sortOrder: Math.max(0, ...all.map((c) => c.sortOrder)) + 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.categories.add(cat);
    return cat;
  });
}

/** Rename any category (system ones keep their stable key). Kind never changes. */
export async function renameCategory(id: string, name: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.categories, async () => {
    const cat = await db.categories.get(id);
    if (!cat) throw new ValidationError(["Categoria não encontrada."]);
    assertValid(nameErrors(name, cat.kind, await db.categories.toArray(), id));
    await db.categories.update(id, { name: name.trim(), updatedAt: new Date().toISOString() });
  });
}

export async function setCategoryArchived(id: string, archived: boolean, db: FinanceDB = getDb()) {
  const n = await db.categories.update(id, { archived, updatedAt: new Date().toISOString() });
  if (!n) throw new ValidationError(["Categoria não encontrada."]);
}

/** Only unused custom categories may be physically deleted. */
export async function deleteCategory(id: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.categories, db.transactions, async () => {
    const cat = await db.categories.get(id);
    if (!cat) throw new ValidationError(["Categoria não encontrada."]);
    if (cat.system)
      throw new ValidationError(["Categorias do sistema não podem ser excluídas. Arquive-a."]);
    if ((await db.transactions.where("categoryId").equals(id).count()) > 0)
      throw new ValidationError(["Esta categoria tem lançamentos. Arquive-a em vez de excluir."]);
    await db.categories.delete(id);
  });
}
