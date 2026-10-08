import { getDb, defaultSettings, type FinanceDB } from "./db";
import type { Settings } from "@/domain/types";

export async function getSettings(db: FinanceDB = getDb()): Promise<Settings> {
  return (await db.settings.get("app")) ?? defaultSettings();
}

export async function updateSettings(
  patch: Partial<Pick<Settings, "locale" | "displayCurrency" | "lastBackupAt">>,
  db: FinanceDB = getDb(),
): Promise<void> {
  const current = await getSettings(db);
  await db.settings.put({ ...current, ...patch, updatedAt: new Date().toISOString() });
}

export const BACKUP_REMINDER_DAYS = 30;

export function needsBackupReminder(s: Settings, now = new Date()): boolean {
  const ref = s.lastBackupAt ?? s.createdAt;
  return now.getTime() - new Date(ref).getTime() > BACKUP_REMINDER_DAYS * 86_400_000;
}
