import { describe, expect, it } from "vitest";
import { adjacentMonth, budgetUsage, cashFlow, categoryExpenses, monthBounds, periodTotals, planningTransactions, validateBudget } from "../planning";
import type { Account, Budget, Category, RecurringRule, Transaction } from "../types";

const today = "2026-10-16";
const audit = { id: "a", createdAt: "", updatedAt: "" };
const account: Account = { ...audit, name: "Banco", currency: "BRL", kind: "checking", openingBalance: 100000, archived: false };
const category: Category = { ...audit, id: "food", name: "Alimentação", key: null, kind: "expense", archived: false, system: false, sortOrder: 1 };
const tx = (p: Partial<Transaction> = {}): Transaction => ({ ...audit, type: "expense", status: "confirmed", date: "2026-10-10", amount: 10000, currency: "BRL", accountId: "a", categoryId: "food", description: "Compra", ...p });
const rule: RecurringRule = { ...audit, id: "r", name: "Aluguel", type: "expense", amount: 20000, currency: "BRL", accountId: "a", categoryId: "food", frequency: "monthly", interval: 1, startDate: "2026-10-20", active: true };
const budget: Budget = { ...audit, id: "b", categoryId: "food", month: "2026-10", currency: "BRL", amount: 10000 };

describe("Phase 4 planning", () => {
  it("separates actual, scheduled and planned; excludes transfers and loan proceeds from income", () => {
    const rows = [tx(), tx({ type: "income", amount: 50000 }), tx({ date: "2026-10-20", amount: 3000 }), tx({ status: "planned", amount: 4000 }), tx({ type: "transfer", destinationAccountId: "z", amount: 9000 }), tx({ type: "loan_proceeds", amount: 100000 }), tx({ currency: "USD", amount: 20000 })];
    const out = periodTotals(rows, "2026-10-01", "2026-10-31", today, "BRL");
    expect(out).toEqual({ actual: { income: 50000, expense: 10000 }, scheduled: { income: 0, expense: 3000 }, planned: { income: 0, expense: 4000 }, expected: { income: 50000, expense: 17000 } });
  });
  it("counts only actual expense-category entries in the selected month and currency", () => {
    expect(categoryExpenses([tx(), tx({ date: "2026-09-30" }), tx({ date: "2026-10-20" }), tx({ status: "planned" }), tx({ type: "transfer" }), tx({ currency: "USD" })], "2026-10-01", "2026-10-31", today, "BRL")).toEqual({ food: 10000 });
  });
  it("merges confirmed and individually moved recurring overrides once", () => {
    const moved = tx({ recurringRuleId: "r", occurrenceDate: "2026-10-20", date: "2026-11-02", amount: 25000 });
    const rows = planningTransactions([moved], [rule], [], "2026-10-01", "2026-11-30");
    expect(rows.map((t) => [t.date,t.amount])).toEqual([["2026-11-02",25000],["2026-11-20",20000]]);
    expect(periodTotals(rows,"2026-10-01","2026-10-31",today,"BRL").expected.expense).toBe(0);
    expect(periodTotals(rows,"2026-11-01","2026-11-30",today,"BRL").expected.expense).toBe(45000);
  });
  it("keeps stored occurrences when paused or ended, and excludes skipped virtual dates", () => {
    const stored = tx({ recurringRuleId: "r", occurrenceDate: "2026-10-20" });
    for (const r of [{...rule, active:false}, {...rule, endedAt:"2026-10-16T00:00:00Z"}]) expect(planningTransactions([stored],[r],[],"2026-10-01","2026-10-31")).toEqual([stored]);
    expect(planningTransactions([], [rule], [{id:"skip",recurringRuleId:"r",occurrenceDate:"2026-10-20"}],"2026-10-01","2026-10-31")).toEqual([]);
    expect(planningTransactions([stored],[],[],"2026-10-01","2026-10-31")).toEqual([stored]);
  });
  it("reconciles current and projected balance with a recurring forecast", () => {
    const rows = planningTransactions([tx()], [rule], [], "2026-10-01", "2026-10-31");
    const out = cashFlow([account], rows, "2026-10-01", "2026-10-31", today,"BRL");
    expect(out.actualClosing).toBe(90000);
    expect(out.projectedClosing).toBe(70000);
    expect(out.days[1]?.planned).toBe(-20000);
  });
  it("consolidated internal transfers cancel; account filters retain the single effect", () => {
    const b = { ...account, id:"z", openingBalance:50000 };
    const rows = [tx({type:"transfer",destinationAccountId:"z",amount:30000})];
    const total = cashFlow([account,b],rows,"2026-10-01","2026-10-31",today,"BRL");
    expect([total.income,total.expense,total.transfers,total.actualClosing]).toEqual([0,0,0,150000]);
    expect(cashFlow([account,b],rows,"2026-10-01","2026-10-31",today,"BRL","a").actualClosing).toBe(70000);
    expect(cashFlow([account,b],rows,"2026-10-01","2026-10-31",today,"BRL","z").actualClosing).toBe(80000);
  });
  it("opening balances include prior rows, and future confirmed amounts only affect projection", () => {
    const rows = [tx({date:"2026-09-30",amount:1000}),tx({date:"2026-10-20",amount:2000})];
    const out = cashFlow([account], rows,"2026-10-01","2026-10-31",today,"BRL");
    expect([out.opening,out.actualClosing,out.projectedClosing]).toEqual([99000,99000,97000]);
    const future = cashFlow([account],rows,"2026-11-01","2026-11-30",today,"BRL");
    expect([future.opening,future.projectedOpening]).toEqual([99000,97000]);
    expect(cashFlow([account],rows,"2026-10-01","2026-10-31","2026-10-20","BRL").actualClosing).toBe(97000);
  });
  it("dedicated debt cash operations affect cash once, not ordinary income or expense", () => {
    const out = cashFlow([account],[tx({type:"loan_proceeds",amount:50000,debtId:"d"}),tx({type:"debt_payment",amount:20000,debtId:"d"})],"2026-10-01","2026-10-31",today,"BRL");
    expect([out.actualClosing,out.income,out.expense,out.other]).toEqual([130000,0,0,30000]);
  });
  it("keeps archived accounts available explicitly but out of active-account consolidation", () => {
    const archived = { ...account, archived:true };
    expect(cashFlow([archived],[tx()],"2026-10-01","2026-10-31",today,"BRL").actualClosing).toBe(0);
    expect(cashFlow([archived],[tx()],"2026-10-01","2026-10-31",today,"BRL","a").actualClosing).toBe(90000);
  });
  it("calculates used and remaining values exactly, isolating month and currency", () => {
    const usage = budgetUsage([budget,{...budget,id:"usd",currency:"USD"},{...budget,id:"nov",month:"2026-11"}],[tx({amount:2501}),tx({status:"planned"}),tx({date:"2026-10-25"})],"2026-10",today,"BRL");
    expect(usage).toHaveLength(1);
    expect([usage[0]?.used,usage[0]?.remaining,usage[0]?.percent]).toEqual([2501,7499,25]);
  });
  it.each([[7900,"normal"],[8000,"near"],[10000,"limit"],[11000,"over"]] as const)("flags usage %i as %s",(amount,state) => {
    const usage = budgetUsage([budget],[tx({amount})],"2026-10",today,"BRL")[0];
    expect(usage?.state).toBe(state);
    expect(usage?.remaining).toBe(10000-amount);
  });
  it("rejects new archived categories but allows updating a retained archived budget", () => {
    const archived = {...category, archived:true};
    expect(validateBudget(budget,[archived])).toHaveLength(1);
    expect(validateBudget(budget,[archived],budget)).toEqual([]);
    expect(validateBudget({...budget,amount:0},[category])).toHaveLength(1);
    expect(validateBudget(budget,[{...category,kind:"income"}])).toHaveLength(1);
  });
  it("changes month across years and handles leap-year boundaries", () => {
    expect(monthBounds("2024-02")).toEqual({from:"2024-02-01",to:"2024-02-29"});
    expect(adjacentMonth("2026-12",1)).toBe("2027-01");
    expect(adjacentMonth("2026-01",-1)).toBe("2025-12");
    expect(monthBounds("2026-13")).toBeNull();
    expect(budgetUsage([budget],[tx()],"2026-11",today,"BRL")).toEqual([]);
  });
});