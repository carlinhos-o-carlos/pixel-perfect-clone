# Phase 3 — Recurring entries

## Delivered

- Planning now includes recurring income and expense rules: create, edit, pause, resume, and permanently end.
- Weekly, fortnightly (every 14 days anchored to the start date), monthly, and yearly schedules.
- Monthly/yearly dates clamp to the last valid day without drifting later occurrences.
- Inclusive start/end bounds and a rolling three-month viewing window with “Mostrar mais”. Earlier windows can be selected to confirm overdue occurrences.
- Forecasts are calculated without database writes. An occurrence is saved only on confirmation or an explicit individual save; closing its editor makes no write.
- Confirmation is idempotent, including concurrent requests. Future confirmed entries remain “Agendado” and do not affect current balances.
- Stored individual changes override templates; confirmed history stays unchanged by rule edits.
- Rule revisions preserve past forecast templates. Ending a rule preserves saved history and individually edited occurrences.
- Deleting a saved recurring entry creates a skip marker so it does not regenerate.
- Dexie v2 adds the unique recurring-rule/date transaction index and updates the settings schema version; v1 remains unchanged.

## Files

New: `src/domain/recurring.ts`, `src/data/recurring.ts`, `src/ui/RecurringRuleDialog.tsx`, `src/data/__tests__/phase3.test.ts`, `PHASE3.md`.

Updated: `src/domain/types.ts`, `src/data/db.ts`, `src/data/transactions.ts`, `src/ui/EntryContext.tsx`, `src/routes/planejamento.tsx`, `AGENTS.md`, `roadmap.md`.

## Verification

- All 38 automated tests pass (26 existing + 12 Phase 3 tests).
- Coverage includes calendar bounds, leap years, month-end clamping, uniqueness, confirmation and balances, individual overrides, rule history, pause/resume, ending, reload persistence, deletion markers, invalid inputs, and v1-to-v2 upgrade preservation.
- Latest automatic build and TypeScript check: OK.
- Lint: zero errors; nine existing fast-refresh warnings, no additional warnings.
- Browser flow checked at phone and desktop widths: create account and rule, confirm an occurrence, reload, edit another to 125.00, change template to 200.00, confirm historical amount stays 100.00, pause/resume, and end. Current balance reads 900.00 from a 1,000.00 opening balance; no browser page errors or horizontal overflow.

## Scope and limitations

- Local browser storage only; no cloud, account, synchronization, paid service, or new dependency.
- Recurring transfers are not enabled; recurrence rules are income/expense only.
- The selected viewing window is three months; it is not an unlimited future materialization.
- Pausing hides unsaved forecasts while saved entries remain; resuming regenerates forecasts in the selected window.
- Budget, cash-flow forecasting, backup/restore, and the remaining PWA work stay in their approved later phases. No Phase 4 work has started.