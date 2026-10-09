import type { Cents, CurrencyCode } from "./money";

/** ISO date "YYYY-MM-DD" (local calendar date, no time zone). */
export type ISODate = string;
/** ISO timestamp for audit fields. */
export type ISOTimestamp = string;

interface Audit {
  id: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export type AccountKind = "checking" | "savings" | "cash" | "brokerage" | "credit_card" | "other";

export interface Account extends Audit {
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  /** Signed: positive = money you have, negative = money you owe (cards). */
  openingBalance: Cents;
  archived: boolean;
}

/** Category kind maps 1:1 to the transaction type it may classify. */
export type CategoryKind = "income" | "expense" | "transfer";

export interface Category extends Audit {
  /** Stable internal key for system categories; null for user-created. */
  key: string | null;
  name: string;
  kind: CategoryKind;
  system: boolean;
  archived: boolean;
  sortOrder: number;
}

export type TransactionType = "income" | "expense" | "transfer" | "debt_payment" | "loan_proceeds";
export type TransactionStatus = "confirmed" | "planned";
export type DebtAllocation = "allocated" | "pending";

export interface Transaction extends Audit {
  type: TransactionType;
  status: TransactionStatus;
  date: ISODate;
  /** Always positive; direction comes from `type`. */
  amount: Cents;
  currency: CurrencyCode;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  description: string;
  notes?: string;
  recurringRuleId?: string;
  occurrenceDate?: ISODate;
  debtId?: string;
  allocation?: DebtAllocation;
  principalAmount?: Cents;
  interestAmount?: Cents;
  feesAmount?: Cents;
}

export type Frequency = "weekly" | "monthly" | "yearly";

export interface RecurringRule extends Audit {
  name: string;
  type: Exclude<TransactionType, "debt_payment" | "loan_proceeds">;
  amount: Cents;
  currency: CurrencyCode;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  frequency: Frequency;
  interval: number;
  dayOfMonth?: number;
  weekday?: number;
  startDate: ISODate;
  endDate?: ISODate;
  active: boolean;
}

/** Marker for a skipped recurring occurrence (same key as a transaction). */
export interface SkippedOccurrence {
  id: string;
  recurringRuleId: string;
  occurrenceDate: ISODate;
}

export type DebtType = "loan" | "financing" | "overdraft" | "personal" | "other";

export interface Debt extends Audit {
  name: string;
  debtType: DebtType;
  currency: CurrencyCode;
  openingBalance: Cents;
  openingDate: ISODate;
  installmentAmount?: Cents;
  totalInstallments?: number;
  nextDueDate?: ISODate;
  paymentAccountId?: string;
  status: "active" | "paid" | "archived";
}

export type AssetType =
  | "real_estate"
  | "vehicle"
  | "business"
  | "receivable"
  | "collectible"
  | "other_investment"
  | "other";

export interface Asset extends Audit {
  name: string;
  assetType: AssetType;
  currency: CurrencyCode;
  value: Cents;
  valuationDate: ISODate;
  notes?: string;
}

export interface Goal extends Audit {
  name: string;
  goalType:
    "emergency_fund" | "purchase" | "travel" | "home" | "debt_payoff" | "independence" | "custom";
  currency: CurrencyCode;
  target: Cents;
  targetDate?: ISODate;
  mode: "account_linked" | "manual";
  linkedAccountIds: string[];
  status: "active" | "achieved" | "archived";
}

export interface GoalAllocation extends Audit {
  goalId: string;
  date: ISODate;
  amount: Cents;
  note?: string;
}

export interface Budget extends Audit {
  categoryId: string;
  month: string; // "YYYY-MM"
  currency: CurrencyCode;
  amount: Cents;
}

export interface Settings {
  id: "app";
  locale: string;
  displayCurrency: CurrencyCode;
  schemaVersion: number;
  lastBackupAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}
