import { getDb, newId, type FinanceDB } from "./db";
import { validateAccount, type AccountInput } from "@/domain/accounts";
import { assertValid, ValidationError } from "@/domain/errors";
import type { Account } from "@/domain/types";

async function txCount(db: FinanceDB, accountId: string): Promise<number> {
  const src = await db.transactions.where("accountId").equals(accountId).count();
  const dst = await db.transactions.where("destinationAccountId").equals(accountId).count();
  return src + dst;
}

export async function listAccounts(db: FinanceDB = getDb()): Promise<Account[]> {
  return (await db.accounts.toArray()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function createAccount(input: AccountInput, db: FinanceDB = getDb()): Promise<Account> {
  assertValid(validateAccount(input));
  const now = new Date().toISOString();
  const account: Account = { id: newId(), ...input, name: input.name.trim(), archived: false, createdAt: now, updatedAt: now };
  await db.accounts.add(account);
  return account;
}

export async function updateAccount(
  id: string,
  input: AccountInput,
  db: FinanceDB = getDb(),
): Promise<Account> {
  return db.transaction("rw", db.accounts, db.transactions, async () => {
    const current = await db.accounts.get(id);
    if (!current) throw new ValidationError(["Conta não encontrada."]);
    assertValid(validateAccount(input));
    if (input.currency !== current.currency && (await txCount(db, id)) > 0)
      throw new ValidationError(["Não é possível trocar a moeda de uma conta que já tem lançamentos."]);
    const next: Account = { ...current, ...input, name: input.name.trim(), updatedAt: new Date().toISOString() };
    await db.accounts.put(next);
    return next;
  });
}

export async function setAccountArchived(id: string, archived: boolean, db: FinanceDB = getDb()) {
  const n = await db.accounts.update(id, { archived, updatedAt: new Date().toISOString() });
  if (!n) throw new ValidationError(["Conta não encontrada."]);
}

/** Physical delete is only allowed for accounts that were never used. */
export async function deleteAccount(id: string, db: FinanceDB = getDb()) {
  await db.transaction("rw", db.accounts, db.transactions, async () => {
    if ((await txCount(db, id)) > 0)
      throw new ValidationError(["Esta conta tem lançamentos. Arquive-a em vez de excluir."]);
    await db.accounts.delete(id);
  });
}
