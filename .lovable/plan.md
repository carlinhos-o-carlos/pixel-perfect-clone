# Phase 0 (revised) — Personal Finance PWA: Product and Architecture Plan

No code is written in this phase. This plan needs your approval before Phase 1 starts.

## 1. Product summary
"Finanças" (working name) is a private personal finance app that keeps all data on your device. You don't need an account or a server, and it works offline after the first load. You can record income, expenses and transfers, plan budgets and recurring items, track debts, assets, goals and net worth, and use planning calculators. You can export and restore your data as a JSON backup at any time. The interface is in pt-BR with BRL formatting by default.

## 2. Screen map (mobile-first)
```text
[Início] [Lançamentos] [ + ] [Planejamento] [Mais]
Início ........ month summary (Realizado vs Previsto), upcoming, goals, net worth
Lançamentos ... list by month, filters, edit/delete
  + Novo lançamento: Receita | Despesa | Transferência | Pagamento de dívida
Planejamento .. Orçamento, Fluxo de Caixa, Recorrentes
Mais .......... Contas, Patrimônio, Dívidas, Objetivos, Ferramentas,
                Categorias, Configurações (moeda, backup/restore, CSV)
```
On desktop, the bottom bar becomes a sidebar.

## 3. Main user journeys
First use (empty state → first account → first transaction); quick entry; transfer to brokerage; recurring salary confirmed each month; monthly budget review; debt payment with principal/interest; credit card purchase and card bill payment; account-linked goal; financial independence estimate; backup and restore.

## 4. Technical architecture
- Keep the existing project: React + TypeScript + Vite + Tailwind (with TanStack Router). The app is fully client-side and needs no server code.
- IndexedDB through Dexie.js, Recharts for charts, vite-plugin-pwa (active only in the published app, never in the editor preview).
- No Lovable Cloud, login, analytics or third-party data transfer.
- Layers: `domain/` (types + pure calculations, tested) · `data/` (Dexie schema, migrations, repositories) · `services/` (use cases) · `io/` (backup, CSV, import adapters) · `ui/` + `routes/` · `pwa/`.
- Vitest tests for `domain/` and `services/`.

## 5. Data model
Money is always stored as **integer minor units** (cents) plus an ISO currency code. IDs are UUIDs. Dates are `YYYY-MM-DD`.

```text
Account ──< Transaction >── Category (optional per type)
   │           ├── recurringRuleId + occurrenceDate → RecurringRule
   │           ├── debtId → Debt (debt payments only)
   │           └── destinationAccountId (transfers)
   └──< Goal (mode = account_linked)
Goal ──< GoalAllocation (mode = manual)
Budget >── Category (expense kind) per month
Asset (manual)   Settings (single row)
```

**Account** — `kind`: `checking | savings | cash | brokerage | credit_card | other`, name, currency, `openingBalance` (signed), archived.

**Category** — stable `key`, editable `name`, and `kind` aligned 1:1 with the flow it can classify:
- `income` → usable only on Income transactions (Receitas, Outras Entradas)
- `expense` → usable only on Expense transactions (Alimentação, Transporte, Saúde e Bem-estar, Lazer, Demais Despesas, Educação, Habitação, plus a system category "Juros e Encargos")
- `transfer` → optional *purpose* for transfers (Investimentos, Reserva, Pagamento de fatura, Outro). Purely descriptive: it never affects income/expense totals.

**Transaction** — `type`: `income | expense | transfer | debt_payment | loan_proceeds`. Amount is always positive and the type sets the direction.
- income/expense: `accountId`, `categoryId` (kind must match).
- transfer: `accountId` (source), `destinationAccountId`, optional `categoryId` (transfer kind). Source ≠ destination, same currency (MVP).
- debt_payment: `accountId`, `debtId`, `principalAmount`, `interestAmount` (fees included in interest for the MVP). See rule D.
- `status`: `confirmed | planned`. `recurringRuleId` and `occurrenceDate` are optional, and the pair is unique.

**RecurringRule** — template fields (type, amount, account, category…), `frequency` (`weekly | monthly | yearly`), interval, day/weekday, start/end, active.

**Debt** — debtType (`loan | financing | overdraft | personal | other`), currency, `openingBalance` (as of `openingDate`), optional installment info, status. Credit cards are **not** Debts (see rule C).

**Asset** — assetType (`real_estate | vehicle | business | receivable | collectible | other_investment | other`), currency, `value`, `valuationDate`, notes. Assets cannot represent money held in an Account.

**Goal** — name, goalType, currency, target, optional target date, `mode`: `account_linked` (list of accountIds) or `manual`.

**GoalAllocation** (manual goals) — goalId, date, amount (+/−), optional note. It is an earmark, not money movement.

**Budget** — expense categoryId, month `YYYY-MM`, currency, amount.

**Settings** — locale, display currency, `schemaVersion`, `lastBackupAt`.

## 6. Financial rules

**A. Three separate views.** Each transaction type contributes differently to each view:

| Type | Cash flow (account balance) | Income/Expense report | Net worth |
|---|---|---|---|
| Income | + account | Income | + |
| Expense | − account | Expense (category) | − |
| Transfer | − source, + destination | none | 0 |
| Debt payment (allocated) | − full amount | interest + fees as expense | − interest − fees |
| Debt payment (pending) | − full amount | none yet | 0 (suspense offset) |
| Loan proceeds | + account | none | 0 |

**B. Actual vs scheduled vs planned.** Each transaction has an *effective state* derived from `status` and `date` relative to today:
- *Realizado* (actual): status confirmed AND date ≤ today. Only these count in today's balances and actual-period reports.
- *Agendado* (scheduled): status confirmed AND date > today. Excluded from today's balances and actual reports until its date arrives (then it becomes actual automatically, with no write needed). Always labeled "Agendado".
- *Previsto* (planned): status planned, or recurring occurrences not yet confirmed. Shown only in forecasts.
Balance as of D = opening balance + Σ confirmed transactions with date ≤ D. Pure function `effectiveState(tx, today)`, with tests.

**C. Credit cards (sign convention).** Every account balance is signed: positive = money you have, negative = money you owe.
- A card purchase is an Expense on the card account, so the balance becomes more negative.
- Paying the card bill is a Transfer from checking to the card (purpose "Pagamento de fatura"). It is not an expense, because the expense was already recorded at purchase.
- Card interest/fees are an Expense on the card account (category Juros e Encargos).
- In net worth, the card's negative balance is counted once, as a liability. Cards cannot be registered as Debts, and the app blocks a debt_payment against a card.

**D. Debts and pending allocation.**
- Outstanding debt = openingBalance − Σ principal of *allocated* confirmed payments.
- A debt_payment has `allocation`: `allocated` (principal + interest + fees = total, validated) or `pending` (split unknown).
- **Pending state:** the full amount leaves the cash account (cash flow is correct). The unallocated amount becomes an explicit domain value `pendingDebtAllocation` (per currency), which net worth adds back as a temporary *suspense asset* labeled "Pagamento a classificar". Net worth therefore does not drop by the full payment. The debt balance and expense report remain unchanged. A badge and a dashboard reminder appear.
- **On allocation:** the pending offset is removed, the debt is reduced by principal, and interest + fees are recognized as expenses (category Juros e Encargos) on the payment date.
- Tests: net worth before payment, while pending (unchanged), and after allocation (dropped by interest + fees only). Validation tests for split sums.

**D2. Loan proceeds.** A dedicated transaction type `loan_proceeds` (accountId, debtId, amount). It increases the account balance, does not count as income, and is linked to the Debt, whose openingBalance carries the liability. Net worth change = 0.
- Created only when the user ticks "Registrar entrada do valor na conta" while creating the Debt.
- Duplicate guard: at most one loan_proceeds per debt (unique index on debtId for this type). The checkbox is hidden or disabled once one exists, and the form warns if a similar income in the same amount appears within ±7 days.
- Tests: balance +amount, income report unchanged, net worth unchanged, second insert rejected.

**E. Net worth (per currency).**
Net worth = Σ positive account balances + Σ asset values − Σ |negative account balances| (cards, overdraft accounts) − Σ outstanding Debts.
Double-count guards:
- Brokerage holdings live only in a brokerage Account. Asset types exclude cash and investment accounts, and the form warns about this.
- Cards are only Accounts, never Debts.
- A loan's cash enters through `loan_proceeds` (never income) and the Debt carries the liability, so the two offset.
- `pendingDebtAllocation` is a suspense asset that exists only until the payment is allocated.

**F. Goals (no double counting).**
- *Account-linked:* progress = sum of the linked accounts' current balances (same currency), capped at display, never added to net worth. Each account can be linked to **at most one** goal.
- *Manual:* progress = Σ GoalAllocations. These are earmarks over money already in accounts, so they never change balances or net worth. The app warns if total manual allocations exceed the total positive balances in that currency.
- Goals are never included in totals.

**G. Recurring occurrences.**
- Occurrence key = `ruleId + occurrenceDate` (the scheduled date), enforced with a unique index, so several occurrences per month are supported.
- Occurrences are calculated on the fly as forecasts. A transaction is only stored when the user confirms (or edits) it.
- A skipped occurrence stores a "skipped" marker using the same key.
- Editing a rule affects only unconfirmed future occurrences. Confirmed history is never rewritten.
- Nothing is written to the database during rendering.

**H. Multi-currency.** No exchange rates in the MVP. Every total (balances, cash flow, budgets, net worth) is grouped **by currency** and shown in separate rows. The display currency sets the default for new records and formatting only. It never converts amounts. Transfers between accounts in different currencies are blocked in the MVP.

**I. Precision.** All arithmetic uses integer cents, and rounding happens only for display. Percentages use explicit rounding.

## 7. Backup, restore and migrations
- **Backup:** a JSON file with `{format, backupVersion, schemaVersion, exportedAt, data}`. The app stores `lastBackupAt` and shows a reminder if there's been no backup in 30 days or after many changes.
- **Restore flow:** pick file → validate (format, version, references, amounts) → preview counts per table → step "Baixar backup dos dados atuais" (download offered, can be skipped with explicit acknowledgment) → type-to-confirm "SUBSTITUIR" → replace in a single database transaction (all or nothing) → summary. Backups from older versions are upgraded through the same migration functions. Newer, unknown versions are rejected.
- **Migrations:** Dexie versioned upgrades run inside IndexedDB's upgrade transaction, so a failure rolls back and the old data stays intact. Every migration is a pure, tested function. Before a version bump, the app prompts the user to export a backup. The browser can't reliably save a file automatically, so the app never claims an automatic backup exists. The app requests persistent storage and tells you clearly that clearing browser data or losing the device deletes local data.

## 8. Financial independence calculator
- Simple mode (monthly cost) or detailed mode (itemized). Shows the monthly and annual totals.
- The main input is a **sustainable withdrawal rate** (presets labeled "suposições": conservador 3%, moderado 4%, arrojado 5%, or custom), kept separate from an optional **expected return** used only for the time-to-goal projection.
- Required capital ≈ annual spending ÷ withdrawal rate, labeled "estimativa simplificada".
- Results are labeled in today's money. You can enter return as a real rate (after inflation).
- A permanent notes panel explains: inflation erodes purchasing power; taxes and fees reduce the effective rate; market volatility and sequence-of-returns risk can deplete capital; withdrawal rates come from historical studies and are not guarantees; this is not investment advice.
- Results show a range across the presets instead of one precise number.

## 9. Decisions
Settled: 30-day backup reminder; loan proceeds are recorded only via the opt-in checkbox; existing stack and phased process kept. Still open: the reference spreadsheet (needed before Phase 8). The app name ("Finanças") and visual style are provisional choices made in Phase 1 that you can change.

## 10. Implementation sequence
1. Foundation: design system, navigation, Dexie schema v1, seed categories, settings, tests.
2. Accounts, categories, income/expense/transfer, balances, credit cards.
3. Recurring rules and occurrences.
4. Dashboard, cash flow, category summaries, budgets.
5. Assets, debts and debt payments, goals, net worth.
6. Calculators (independence, compound interest, emergency fund, financing).
7. PWA offline/install, backup/restore, CSV, migration safety.
8. Spreadsheet import, accessibility, polish, docs, release.

Each phase ends with tests and a report, and then waits for your approval.

## 11. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Local data loss | Backup reminders, persistent storage request, honest messaging |
| Duplicate recurring items | Unique `ruleId + occurrenceDate` index |
| Double counting (cards, debts, goals, brokerage) | Rules C–F enforced in the domain layer, with dedicated tests |
| Misleading totals | Per-currency grouping; "Previsto" and "Agendado" labels |
| Failed migration | Transactional upgrades, tested migration functions, pre-upgrade backup prompt |
| Stale offline app | Guarded service worker, network-first pages, disabled in preview |
| Scope creep | Phase gates; deferred features need approval |

## Assumptions
Single user per device, no sync. Calendar months. pt-BR/BRL defaults. The existing TanStack-based React template is acceptable, and the app stays static and client-side.
