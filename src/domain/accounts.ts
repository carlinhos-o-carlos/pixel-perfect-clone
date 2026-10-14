import type { AccountKind } from "./types";
import type { Cents, CurrencyCode } from "./money";

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro em espécie",
  brokerage: "Corretora",
  credit_card: "Cartão de crédito",
  other: "Outra",
};

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ["BRL", "USD", "EUR", "GBP"];

export interface AccountInput {
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  /** Signed cents: negative means money owed (e.g. an open card bill or overdraft). */
  openingBalance: Cents;
}

export function validateAccount(input: AccountInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Informe o nome da conta.");
  if (input.name.trim().length > 60) errors.push("O nome pode ter no máximo 60 caracteres.");
  if (!(input.kind in ACCOUNT_KIND_LABEL)) errors.push("Tipo de conta inválido.");
  if (!/^[A-Z]{3}$/.test(input.currency)) errors.push("Moeda inválida.");
  if (!Number.isSafeInteger(input.openingBalance)) errors.push("Saldo inicial inválido.");
  if (input.kind === "credit_card" && input.openingBalance > 0)
    errors.push("Cartão de crédito começa com saldo zero ou negativo (valor da fatura em aberto).");
  return errors;
}
