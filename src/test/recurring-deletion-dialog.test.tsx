import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteRecurringRuleDialog } from "@/ui/DeleteRecurringRuleDialog";
import type { RecurringRule } from "@/domain/types";

const { remove } = vi.hoisted(() => ({ remove: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/data/recurring", () => ({ deleteRecurringRule: remove }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const rule: RecurringRule = {
  id: "rule",
  name: "Aluguel",
  type: "expense",
  amount: 1000,
  currency: "BRL",
  accountId: "account",
  categoryId: "category",
  frequency: "monthly",
  interval: 1,
  startDate: "2026-01-01",
  active: true,
  createdAt: "now",
  updatedAt: "now",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("confirmação de exclusão", () => {
  it("cancelar não executa nenhuma alteração", () => {
    const close = vi.fn();
    render(<DeleteRecurringRuleDialog rule={rule} onClose={close} />);
    expect(screen.getAllByRole("radio")[0]).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(remove).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
  it("bloqueia exclusão do histórico até confirmação explícita", async () => {
    const close = vi.fn();
    render(<DeleteRecurringRuleDialog rule={rule} onClose={close} />);
    fireEvent.click(screen.getByRole("radio", { name: /Excluir a regra e seu histórico/ }));
    const submit = screen.getByRole("button", { name: "Excluir regra e histórico" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith("rule", {
        mode: "rule-and-history",
        historyConfirmed: true,
      }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("exclui apenas a regra por padrão", async () => {
    render(<DeleteRecurringRuleDialog rule={rule} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir somente a regra" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("rule", { mode: "rule-only" }));
  });
});
