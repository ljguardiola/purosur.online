import type { PurchaseSummary } from "@purosur/contracts";
import { purchaseLineCostCorrectionBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { BadgeDollarSign, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToOwnAccount } from "../platform/send-to-own-account";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import {
  EMPTY_PURCHASE_LINE_COST,
  PURCHASE_LINE_COST_FIELDS,
  purchaseLineCostLabel,
  purchaseLineCostMessage,
  purchaseLineCostRequestFrom,
  purchaseLineCostValuesOf,
} from "./purchase-line-cost-form";
import type { correctPurchaseLineCost } from "./purchases-api";

export type CorrectPurchaseLineCostModalServices = {
  correctPurchaseLineCost: typeof correctPurchaseLineCost;
};

export type PurchaseLineCostTarget = {
  purchase: PurchaseSummary;
  line: PurchaseSummary["lines"][number];
};

type CorrectPurchaseLineCostModalProps = {
  target: PurchaseLineCostTarget | null;
  services: CorrectPurchaseLineCostModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function CorrectPurchaseLineCostModal({
  target,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: CorrectPurchaseLineCostModalProps) {
  const sendToOwnAccount = useSendToOwnAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseLineCostTarget | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PURCHASE_LINE_COST,
    request: {
      schema: purchaseLineCostCorrectionBodySchema,
      from: purchaseLineCostRequestFrom,
    },
    fields: PURCHASE_LINE_COST_FIELDS,
    messages: { cost: purchaseLineCostMessage },
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.correctPurchaseLineCost(
        target.purchase.id,
        target.line.id,
        request,
      );
      if (outcome.kind === "ok") {
        onSaved(outcome.purchase);
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToOwnAccount();
        return;
      }
      if (outcome.kind === "unchanged") {
        setNotice({ kind: "unchanged" });
        return;
      }
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (target) {
      reset(purchaseLineCostValuesOf(target.line));
      setShown(target);
      setNotice(null);
    }
  }, [target, reset]);

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="wide"
      tone="info"
      icon={<BadgeDollarSign />}
      context="Compras · Compra"
      title={shown ? formatProductDescription(shown.line.product) : ""}
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            disabled={submitting}
            onPress={() => void submit()}
          >
            Guardar el costo
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se corrigió el costo" />
          <form.AppField name="cost">
            {(field) => (
              <field.TextField
                kind="price"
                label={purchaseLineCostLabel(target.line)}
                prefix="$"
                decimals={2}
                required
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
