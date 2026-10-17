import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { deleteRecurringRule } from "@/data/recurring";
import type { RecurringRule } from "@/domain/types";
import { errorMessages } from "@/ui/form";

export function DeleteRecurringRuleDialog({
  rule,
  onClose,
}: {
  rule: RecurringRule;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"rule-only" | "rule-and-history">("rule-only");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await deleteRecurringRule(
        rule.id,
        mode === "rule-only" ? { mode } : { mode, historyConfirmed: confirmed },
      );
      toast.success(
        mode === "rule-only"
          ? "Regra excluída. Histórico preservado."
          : "Regra e histórico vinculados excluídos.",
      );
      onClose();
    } catch (error) {
      toast.error(errorMessages(error).join(" "));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg">
        <AlertDialogTitle className="break-words">Excluir {rule.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          Escolha o que deseja remover. Esta ação não pode ser desfeita.
        </AlertDialogDescription>
        <fieldset disabled={busy} className="grid gap-4">
          <legend className="sr-only">Tipo de exclusão</legend>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="deletion-mode"
              className="mt-1 accent-primary"
              checked={mode === "rule-only"}
              onChange={() => {
                setMode("rule-only");
                setConfirmed(false);
              }}
            />
            <span>
              <span className="block font-semibold">Excluir somente a regra</span>
              <span className="block text-sm text-muted-foreground">
                Remove a recorrência e suas ocorrências futuras não confirmadas. Todos os
                lançamentos confirmados são preservados, inclusive os agendados e editados
                individualmente.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border-t pt-4">
            <input
              type="radio"
              name="deletion-mode"
              className="mt-1 accent-destructive"
              checked={mode === "rule-and-history"}
              onChange={() => {
                setMode("rule-and-history");
                setConfirmed(false);
              }}
            />
            <span>
              <span className="block font-semibold text-destructive">
                Excluir a regra e seu histórico
              </span>
              <span className="block text-sm text-muted-foreground">
                Também apaga os lançamentos vinculados, incluindo os confirmados e editados
                individualmente. Isso altera seu histórico financeiro, saldos e relatórios.
              </span>
            </span>
          </label>
        </fieldset>
        {mode === "rule-and-history" && (
          <label className="flex items-start gap-3 text-sm text-destructive">
            <Checkbox
              checked={confirmed}
              disabled={busy}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            Confirmo que quero apagar o histórico vinculado e alterar os saldos e relatórios.
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={mode === "rule-only" ? "default" : "destructive"}
            disabled={busy || (mode === "rule-and-history" && !confirmed)}
            onClick={remove}
          >
            {busy
              ? "Excluindo…"
              : mode === "rule-only"
                ? "Excluir somente a regra"
                : "Excluir regra e histórico"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
