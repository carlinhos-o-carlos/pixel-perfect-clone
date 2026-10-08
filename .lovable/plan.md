# Phase 0 — Personal Finance PWA: Product and Architecture Plan

No code is written in this phase. This plan needs your approval before anything gets built.

## 1. Product summary
"Finanças" (working name) is a private personal finance app that runs on your phone, with all data saved on your device. You can record income and expenses, organize accounts, plan your budget, track debts, assets and goals, and estimate how much money you need for financial independence. You don't need an account or an internet connection. You can download and restore your data as a backup file at any time. The interface is in Brazilian Portuguese and uses BRL by default.

## 2. Screen map (mobile-first)
Bottom navigation bar (5 items) plus a floating "Novo lançamento" button:

```text
[Início] [Lançamentos] [ + ] [Planejamento] [Mais]

Início ............ month summary, actual vs. forecast, upcoming items, goals, net worth
Lançamentos ....... list by month, filters, edit/delete, transfers
  + Novo lançamento  bottom sheet: type, amount, category, account, date
Planejamento
  ├ Orçamento ...... limits per category for the month
  ├ Fluxo de Caixa . month-by-month in/out, actual vs. forecast
  └ Recorrentes .... salary, rent, subscriptions
Mais
  ├ Contas
  ├ Patrimônio ..... assets, liabilities, net worth
  ├ Dívidas
  ├ Objetivos
  ├ Ferramentas .... financial independence, compound interest, emergency fund, financing
  ├ Categorias
  └ Configurações .. currency, backup/restore, CSV export, about your data
```
On desktop, the bottom bar becomes a sidebar.

## 3. Main user journeys
1. First use: empty state, create your first account, record your first transaction.
2. Quick entry: tap +, enter an amount, pick a category, save (under 10 seconds).
3. Transfer: move money from your bank to your brokerage. Net worth stays the same.
4. Recurring: create "Salário" once. Each month the app shows it as a forecast, and you confirm it when the money actually arrives.
5. Monthly review: budget progress per category and cash flow.
6. Debt payment: record a payment. The money leaves your account and the debt balance goes down.
7. Goal: create an emergency fund linked to a savings account and watch progress.
8. Independence: enter your desired monthly lifestyle and see the estimated capital needed, plus a clear list of limitations.
9. Backup: export a JSON file, then restore it on another device.

## 4. Technical architecture
- Keep the existing project stack: React + TypeScript + Vite + Tailwind, already set up with TanStack Router. It can be served as a static app with no server code.
- Data storage: IndexedDB through Dexie.js. Charts: Recharts. Offline and installation: vite-plugin-pwa, only active in the published app (never in the editor preview).
- No Lovable Cloud, no login, no analytics.
- Layers (folders):
  - `domain/` — types and pure financial calculations, no React (fully tested)
  - `data/` — Dexie database, schema versions, migrations, repositories
  - `services/` — use cases (create transaction, materialize recurring, pay debt)
  - `io/` — backup/restore, CSV, future spreadsheet import adapter
  - `ui/` + `routes/` — screens and components
  - `pwa/` — guarded service worker registration
- Tests: Vitest for `domain/` and `services/` (using an in-memory IndexedDB).

## 5. Data model
All money is stored as **integer cents** (e.g. R$ 12,34 = 1234) together with a currency code. IDs are UUIDs, and dates are ISO strings (`YYYY-MM-DD`).

```text
Account ──< Transaction >── Category
   │            │  │ └── recurringId → RecurringRule
   │            │  └──── debtId → Debt
   │            └─────── destinationAccountId (transfers)
   └──< Goal (linkedAccountId)
Budget >── Category (per month "YYYY-MM")
Asset (standalone, manual value)
Settings (single row)
```
- **Account**: kind (`checking|savings|brokerage|cash|credit_card|other`), name, currency, initialBalance, archived.
- **Category**: internal `key` (stable, e.g. `food`), `kind` (`income|expense|investment`), editable display name. The seed uses your Portuguese names. Users can create their own categories.
- **Transaction**: type `income|expense|transfer`, status `confirmed|planned`, amount (always positive), date, account, optional category/destination/debt/goal/recurring.
- **RecurringRule**: monthly/weekly/yearly, day, start/end, active.
- **Debt**: original amount, opening balance, installment info, status. The outstanding balance is calculated from linked payments.
- **Goal**: target, optional date, type. Progress comes from the linked account balance or from manual contributions (see decisions).
- **Asset**: manual value + valuation date (real estate, vehicles only).
- **Budget**: category + month + amount.
- **Settings**: display currency, locale, schema/backup version.

## 6. Critical financial rules
1. Transfers never count as income or expense. They change two account balances and leave net worth unchanged.
2. Balance = initial balance + confirmed income − confirmed expenses ± confirmed transfers.
3. "Planned" transactions appear only in forecasts and are always visually distinct from actual values.
4. Recurring generation is idempotent. Each occurrence has a deterministic key (`ruleId + period`), so reopening the app or working offline never creates duplicates. The app never generates anything during screen rendering. Editing a rule never changes past confirmed transactions.
5. Debt payment = an expense from the account (an "Investimentos/Dívidas" category, without double-counting the original loan). It reduces the outstanding balance. You can optionally split principal and interest: only principal reduces the balance.
6. Net worth = account balances + manual assets − outstanding debts. Brokerage accounts are never also listed as assets.
7. Goals linked to an account don't add money. They only show a share of a balance that already exists.
8. Investments category: a contribution to your brokerage is recorded as a transfer, not an expense.
9. All arithmetic happens in integer cents. Rounding happens only when values are displayed.
10. Currencies are never mixed in totals. Totals use the display currency, and accounts in other currencies are shown separately (MVP: no exchange rates).

## 7. Unresolved decisions (your input needed)
1. Should recurring items need to be confirmed (shown as a forecast until you tap "confirm"), or be recorded automatically on their due date? *Proposed: confirm.*
2. Goal progress: linked to an account balance, manual contributions, or both? *Proposed: both, one mode per goal.*
3. Credit cards: treat them as an account with a negative balance in the MVP, and postpone invoice/billing-cycle logic? *Proposed: yes.*
4. Multi-currency: allow non-BRL accounts in the MVP (without conversion)? *Proposed: allow, but don't convert.*
5. Restore behavior: "replace all" (with confirmation and an automatic backup first) only, or also "merge"? *Proposed: replace only for MVP.*
6. Reference spreadsheet: please share it before Phase 8 so the import can be mapped correctly.
7. App name and visual style (colors, look) are to be chosen at the start of Phase 1.

## 8. Implementation sequence
- Phase 1 — Foundation: design system, navigation shell, Dexie schema v1, seed categories, settings, test setup.
- Phase 2 — Accounts, categories, transactions, transfers, balances.
- Phase 3 — Recurring rules and idempotent generation.
- Phase 4 — Dashboard, cash flow, category summaries, budgets.
- Phase 5 — Assets, debts, goals, net worth.
- Phase 6 — Calculators (independence, compound interest, emergency fund, financing).
- Phase 7 — PWA offline/install, JSON backup/restore, CSV export, migration safety.
- Phase 8 — Spreadsheet import, accessibility, polish, docs, release.

Each phase ends with tests, checks, and a report, and then waits for your approval.

## 9. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Browser clears data / device lost | Prominent backup reminder, easy JSON export, request persistent storage, honest messaging |
| Duplicate recurring transactions | Deterministic occurrence keys + unique index |
| Floating-point errors | Integer cents everywhere, tested |
| Double-counting (transfers, goals, investments) | Rules in `domain/`, dedicated tests |
| Stale offline app after updates | Guarded service worker, network-first pages, disabled in preview |
| Schema changes breaking data | Versioned Dexie migrations + automatic backup before upgrade |
| Forecasts mistaken for real money | `planned` status, distinct styling and labels ("Previsto") |
| Scope creep | Strict phase gates; deferred features need explicit approval |

## Assumptions
- Single user, single device; no sync.
- BRL is the default currency and pt-BR the default locale.
- Monthly periods follow calendar months.
- The current project template (TanStack-based React) is acceptable instead of a plain Vite React setup. It's the same core tools, and the app stays fully client-side.
