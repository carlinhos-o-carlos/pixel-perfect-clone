import Dexie, { type EntityTable } from "dexie";
import { SYSTEM_CATEGORIES } from "@/domain/categories";
import type {
  Account,
  Asset,
  AssetValuation,
  Budget,
  Category,
  Debt,
  DebtBalance,
  Goal,
  GoalAllocation,
  RecurringRule,
  Settings,
  SkippedOccurrence,
  Transaction,
} from "@/domain/types";

export const SCHEMA_VERSION = 3;

export class FinanceDB extends Dexie {
  accounts!: EntityTable<Account, "id">;
  categories!: EntityTable<Category, "id">;
  transactions!: EntityTable<Transaction, "id">;
  recurringRules!: EntityTable<RecurringRule, "id">;
  skippedOccurrences!: EntityTable<SkippedOccurrence, "id">;
  debts!: EntityTable<Debt, "id">;
  assets!: EntityTable<Asset, "id">;
  assetValuations!: EntityTable<AssetValuation, "id">;
  debtBalances!: EntityTable<DebtBalance, "id">;
  goals!: EntityTable<Goal, "id">;
  goalAllocations!: EntityTable<GoalAllocation, "id">;
  budgets!: EntityTable<Budget, "id">;
  settings!: EntityTable<Settings, "id">;

  constructor(name = "financas") {
    super(name);
    // v1 schema. Only indexed fields are listed. Future changes add
    // this.version(2)... with a tested upgrade function; never edit v1.
    this.version(1).stores({
      accounts: "id, kind, currency, archived",
      categories: "id, &key, kind, archived",
      transactions:
        "id, date, type, status, accountId, destinationAccountId, categoryId, debtId, [recurringRuleId+occurrenceDate]",
      recurringRules: "id, active",
      skippedOccurrences: "id, &[recurringRuleId+occurrenceDate]",
      debts: "id, status",
      assets: "id, assetType",
      goals: "id, status",
      goalAllocations: "id, goalId",
      budgets: "id, &[categoryId+month], month",
      settings: "id",
    });
    // v2 makes each recurring occurrence unique. Keep v1 untouched so existing
    // browser databases are upgraded safely in place.
    this.version(2)
      .stores({
        transactions:
          "id, date, type, status, accountId, destinationAccountId, categoryId, debtId, &[recurringRuleId+occurrenceDate]",
      })
      .upgrade(async (tx) => {
        await tx.table("settings").toCollection().modify({ schemaVersion: 2 });
      });
    // v3 (Phase 5) adds append-only value histories for assets and debts.
    // Existing rows are only given safe defaults; nothing is removed.
    this.version(3)
      .stores({
        assets: "id, assetType, archived",
        assetValuations: "id, assetId",
        debtBalances: "id, debtId",
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString();
        await tx.table("assets").toCollection().modify((a: Asset) => {
          a.archived ??= false;
          a.countedInAccounts ??= false;
        });
        const assets: Asset[] = await tx.table("assets").toArray();
        await tx.table("assetValuations").bulkAdd(
          assets.map((a) => ({
            id: newId(),
            assetId: a.id,
            date: a.valuationDate,
            value: a.value,
            createdAt: now,
          })),
        );
        const debts: Debt[] = await tx.table("debts").toArray();
        await tx.table("debtBalances").bulkAdd(
          debts.map((d) => ({
            id: newId(),
            debtId: d.id,
            date: d.openingDate,
            balance: d.openingBalance,
            createdAt: now,
          })),
        );
      });
    this.on("populate", (tx) => seedInitialData(tx.table("categories"), tx.table("settings")));
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

async function seedInitialData(
  categories: Dexie.Table<Category, string>,
  settings: Dexie.Table<Settings, string>,
) {
  const now = new Date().toISOString();
  await categories.bulkAdd(
    SYSTEM_CATEGORIES.map((c, i) => ({
      id: newId(),
      key: c.key,
      name: c.name,
      kind: c.kind,
      system: true,
      archived: false,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    })),
  );
  await settings.add(defaultSettings(now));
}

export function defaultSettings(now = new Date().toISOString()): Settings {
  return {
    id: "app",
    locale: "pt-BR",
    displayCurrency: "BRL",
    schemaVersion: SCHEMA_VERSION,
    lastBackupAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

let instance: FinanceDB | null = null;
/** Lazy singleton so the database is only opened in the browser. */
export function getDb(): FinanceDB {
  if (!instance) instance = new FinanceDB();
  return instance;
}
