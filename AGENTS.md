<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Local-first: all data in IndexedDB via Dexie (`src/data/db.ts`); no backend/auth — privacy requirement from the product brief.
- Money is integer cents + currency code (`src/domain/money.ts`); never float math — avoids rounding errors.
- Financial logic lives in pure `src/domain/` functions with Vitest tests; UI never computes totals itself.
- Schema changes add a new Dexie `version(n)` with a tested upgrade; never edit an existing version — protects stored user data.
- Category kind maps 1:1 to transaction type (income/expense/transfer); transfers never count as income/expense.
- Phased delivery: each phase needs explicit user approval before the next.
