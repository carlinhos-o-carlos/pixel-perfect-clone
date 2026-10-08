import type { CategoryKind, TransactionType } from "./types";

export interface SystemCategorySeed {
  key: string;
  name: string;
  kind: CategoryKind;
}

/** Initial categories (names in pt-BR, keys stable and language-independent). */
export const SYSTEM_CATEGORIES: SystemCategorySeed[] = [
  { key: "income_salary", name: "Receitas", kind: "income" },
  { key: "income_other", name: "Outras Entradas", kind: "income" },
  { key: "expense_food", name: "Alimentação", kind: "expense" },
  { key: "expense_transport", name: "Transporte", kind: "expense" },
  { key: "expense_health", name: "Saúde e Bem-estar", kind: "expense" },
  { key: "expense_leisure", name: "Lazer", kind: "expense" },
  { key: "expense_other", name: "Demais Despesas", kind: "expense" },
  { key: "expense_education", name: "Educação", kind: "expense" },
  { key: "expense_housing", name: "Habitação", kind: "expense" },
  { key: "expense_interest_fees", name: "Juros e Encargos", kind: "expense" },
  { key: "transfer_investments", name: "Investimentos", kind: "transfer" },
  { key: "transfer_reserve", name: "Reserva", kind: "transfer" },
  { key: "transfer_card_bill", name: "Pagamento de fatura", kind: "transfer" },
  { key: "transfer_other", name: "Outro", kind: "transfer" },
];

/** Which category kind (if any) a transaction type may use. */
export function categoryKindFor(type: TransactionType): CategoryKind | null {
  switch (type) {
    case "income":
      return "income";
    case "expense":
      return "expense";
    case "transfer":
      return "transfer";
    default:
      return null; // debt_payment / loan_proceeds use system logic
  }
}

export function isCategoryCompatible(type: TransactionType, kind: CategoryKind): boolean {
  return categoryKindFor(type) === kind;
}

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Finalidade de transferência",
};
