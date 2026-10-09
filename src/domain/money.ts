/**
 * Money is always stored as integer minor units (cents) plus an ISO 4217 code.
 * Never use floating point for stored amounts; conversion happens only at
 * input parsing and display formatting.
 */
export type CurrencyCode = string; // ISO 4217, e.g. "BRL"
export type Cents = number; // always an integer

export interface Money {
  amount: Cents;
  currency: CurrencyCode;
}

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Valor monetário inválido (precisa ser inteiro em centavos): ${value}`);
  }
  return value;
}

export function addCents(...values: Cents[]): Cents {
  return values.reduce((sum, v) => assertCents(sum + assertCents(v)), 0);
}

/** Minor-unit digits for a currency (BRL/USD/EUR = 2, JPY = 0). */
export function currencyDigits(currency: CurrencyCode): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Parse user text into cents. Accepts pt-BR ("1.234,56") and plain ("1234.56").
 * Returns null for invalid input. Uses string arithmetic, never float math.
 */
export function parseToCents(input: string, currency: CurrencyCode = "BRL"): Cents | null {
  const digits = currencyDigits(currency);
  let s = input.trim().replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const sepIndex = Math.max(lastComma, lastDot);
  let intPart = s;
  let fracPart = "";
  if (sepIndex >= 0) {
    const tail = s.slice(sepIndex + 1);
    // A separator followed by exactly 3 digits with another earlier separator,
    // or a dot followed by 3 digits in pt-BR style, is a thousands separator.
    const isDecimal = tail.length > 0 && tail.length <= digits && !(tail.length === 3);
    if (isDecimal || (tail.length <= digits && digits > 0)) {
      intPart = s.slice(0, sepIndex);
      fracPart = tail;
    }
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (!intPart && !fracPart) return null;
  const frac = (fracPart + "0".repeat(digits)).slice(0, digits);
  const value = Number((intPart || "0") + frac);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

export function formatMoney(
  amount: Cents,
  currency: CurrencyCode = "BRL",
  locale = "pt-BR",
): string {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount / 10 ** digits);
}

/** Sum amounts grouped by currency. Never combines different currencies. */
export function sumByCurrency(items: Money[]): Record<CurrencyCode, Cents> {
  const out: Record<CurrencyCode, Cents> = {};
  for (const { amount, currency } of items) {
    out[currency] = addCents(out[currency] ?? 0, amount);
  }
  return out;
}
