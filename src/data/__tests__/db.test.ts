import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { FinanceDB, newId } from "../db";
import { getSettings, needsBackupReminder, updateSettings } from "../settings";

let db: FinanceDB;
afterEach(async () => {
  await db?.delete();
});

describe("database v1", () => {
  it("seeds system categories and default settings once", async () => {
    db = new FinanceDB(`t-${newId()}`);
    await db.open();
    expect(await db.categories.count()).toBe(14);
    const s = await getSettings(db);
    expect(s.displayCurrency).toBe("BRL");
    expect(s.locale).toBe("pt-BR");
    db.close();
    await db.open(); // reopening must not reseed
    expect(await db.categories.count()).toBe(14);
  });

  it("rejects duplicate recurring occurrence skip markers", async () => {
    db = new FinanceDB(`t-${newId()}`);
    await db.open();
    const row = { recurringRuleId: "r1", occurrenceDate: "2026-10-05" };
    await db.skippedOccurrences.add({ id: newId(), ...row });
    await expect(db.skippedOccurrences.add({ id: newId(), ...row })).rejects.toThrow();
  });

  it("updates settings and computes the 30-day backup reminder", async () => {
    db = new FinanceDB(`t-${newId()}`);
    await db.open();
    await updateSettings({ displayCurrency: "USD" }, db);
    const s = await getSettings(db);
    expect(s.displayCurrency).toBe("USD");
    const created = new Date(s.createdAt);
    expect(needsBackupReminder(s, new Date(created.getTime() + 29 * 86_400_000))).toBe(false);
    expect(needsBackupReminder(s, new Date(created.getTime() + 31 * 86_400_000))).toBe(true);
  });
});
