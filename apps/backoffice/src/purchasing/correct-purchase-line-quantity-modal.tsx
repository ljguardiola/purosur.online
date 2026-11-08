import type { PurchaseSummary } from "@purosur/contracts";
import { purchaseLineQuantityCorrectionBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Check, Scale, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatStockQuantity, quantityFieldKind } from "../platform/stock-quantity";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import {
  EMPTY_PURCHASE_LINE_QUANTITY,
  PURCHASE_LINE_QUANTITY_FIELDS,
  purchaseLineQuantityLabel,
  purchaseLineQuantityMessages,
  purchaseLineQuantityRequestFrom,
  purchaseLineQuantityValuesOf,
} from "./purchase-line-quantity-form";
import type { correctPurchaseLineQuantity } from "./purchases-api";

export type CorrectPurchaseLineQuantityModalServices = {
  correctPurchaseLineQuantity: typeof correctPurchaseLineQuantity;
};

export type PurchaseLineQuantityTarget = {
  purchase: PurchaseSummary;
  line: PurchaseSummary["lines"][number];
};

type CorrectPurchaseLineQuantityModalProps = {
  target: PurchaseLineQuantityTarget | null;
  remainingInLot: number;
  services: CorrectPurchaseLineQuantityModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onLotChanged: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

function lotContext(line: PurchaseSummary["lines"][number], remainingInLot: number): string {
  const { saleUnit } = line.product;
  const remaining = `Quedan ${formatStockQuantity(remainingInLot, saleUnit)} en el lote`;
  return line.packages === null
    ? remaining
    : `Cada paquete trae ${formatStockQuantity(line.quantityPerPackage, saleUnit)} · ${remaining}`;
}

export function CorrectPurchaseLineQuantityModal({
  target,
  remainingInLot,
  services,
  onSaved,
  onLotChanged,
  onClose,
  onSessionEnded,
}: CorrectPurchaseLineQuantityModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseLineQuantityTarget | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const line = target?.line ?? shown?.line;
  const lineShape = {
    packages: line?.packages ?? null,
    product: { saleUnit: line?.product.saleUnit ?? "UNIT" },
  };
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PURCHASE_LINE_QUANTITY,
    request: {
      schema: purchaseLineQuantityCorrectionBodySchema,
      from: (values) => purchaseLineQuantityRequestFrom(values, lineShape),
    },
    fields: PURCHASE_LINE_QUANTITY_FIELDS,
    messages: purchaseLineQuantityMessages(lineShape),
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.correctPurchaseLineQuantity(
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
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "unchanged") {
        setNotice({ kind: "unchanged" });
        return;
      }
      if (outcome.kind === "not_enough_in_lot") {
        setNotice({ kind: "unitsLeftTheLot" });
        onLotChanged();
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
      reset(purchaseLineQuantityValuesOf(target.line));
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
      icon={<Scale />}
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
            Guardar la cantidad
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se corrigió la cantidad" />
          <form.AppField name="amount">
            {(field) => (
              <field.TextField
                {...(target.line.packages === null
                  ? quantityFieldKind(target.line.product.saleUnit)
                  : { kind: "plain-text" as const })}
                label={purchaseLineQuantityLabel(target.line)}
                description={lotContext(target.line, remainingInLot)}
                required
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
