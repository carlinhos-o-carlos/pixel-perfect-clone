import { describe, expect, it } from "vitest";
import { addCents, formatMoney, parseToCents, sumByCurrency } from "../money";
import { SYSTEM_CATEGORIES, isCategoryCompatible } from "../categories";
import { effectiveState } from "../dates";

describe("money", () => {
  it("parses pt-BR and plain inputs to integer cents", () => {
    expect(parseToCents("1.234,56")).toBe(123456);
    expect(parseToCents("1234.56")).toBe(123456);
    expect(parseToCents("R$ 10")).toBe(1000);
    expect(parseToCents("0,1")).toBe(10);
    expect(parseToCents("1.000")).toBe(100000);
    expect(parseToCents("-5,5")).toBe(-550);
    expect(parseToCents("abc")).toBeNull();
    expect(parseToCents("")).toBeNull();
  });
  it("avoids floating point errors (0.1 + 0.2)", () => {
    expect(addCents(10, 20)).toBe(30);
  });
  it("rejects non-integer cents", () => {
    expect(() => addCents(1.5)).toThrow();
  });
  it("formats BRL", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("never mixes currencies", () => {
    expect(
      sumByCurrency([
        { amount: 100, currency: "BRL" },
        { amount: 50, currency: "USD" },
        { amount: 25, currency: "BRL" },
      ]),
    ).toEqual({ BRL: 125, USD: 50 });
  });
});

describe("categories", () => {
  it("has unique keys and the expected pt-BR names", () => {
    const keys = SYSTEM_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const names = SYSTEM_CATEGORIES.map((c) => c.name);
    for (const n of ["Receitas", "Outras Entradas", "Alimentação", "Habitação", "Investimentos"]) {
      expect(names).toContain(n);
    }
  });
  it("Investimentos is a transfer purpose, never an expense", () => {
    expect(SYSTEM_CATEGORIES.find((c) => c.name === "Investimentos")?.kind).toBe("transfer");
  });
  it("enforces category/transaction compatibility", () => {
    expect(isCategoryCompatible("expense", "expense")).toBe(true);
    expect(isCategoryCompatible("expense", "income")).toBe(false);
    expect(isCategoryCompatible("transfer", "transfer")).toBe(true);
    expect(isCategoryCompatible("debt_payment", "expense")).toBe(false);
  });
});

describe("effectiveState", () => {
  const today = "2026-10-08";
  it("distinguishes actual, scheduled and planned", () => {
    expect(effectiveState({ status: "confirmed", date: "2026-10-08" }, today)).toBe("actual");
    expect(effectiveState({ status: "confirmed", date: "2026-10-09" }, today)).toBe("scheduled");
    expect(effectiveState({ status: "planned", date: "2026-10-01" }, today)).toBe("planned");
  });
});
