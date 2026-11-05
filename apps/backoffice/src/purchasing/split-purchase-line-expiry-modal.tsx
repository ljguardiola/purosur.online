import type { PurchaseSummary } from "@purosur/contracts";
import { purchaseLineExpirySplitBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { CalendarClock, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatStockQuantity, quantityFieldKind } from "../platform/stock-quantity";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import {
  EMPTY_PURCHASE_LINE_EXPIRY_SPLIT,
  PURCHASE_LINE_EXPIRY_SPLIT_FIELDS,
  purchaseLineExpirySplitMessages,
  purchaseLineExpirySplitRequestFrom,
  purchaseLineExpirySplitValuesOf,
} from "./purchase-line-expiry-split-form";
import type { splitPurchaseLineExpiry } from "./purchases-api";

export type SplitPurchaseLineExpiryModalServices = {
  splitPurchaseLineExpiry: typeof splitPurchaseLineExpiry;
};

export type SplitPurchaseLineExpiryTarget = {
  purchase: PurchaseSummary;
  line: PurchaseSummary["lines"][number];
};

type SplitPurchaseLineExpiryModalProps = {
  target: SplitPurchaseLineExpiryTarget | null;
  services: SplitPurchaseLineExpiryModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function SplitPurchaseLineExpiryModal({
  target,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: SplitPurchaseLineExpiryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<SplitPurchaseLineExpiryTarget | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const saleUnit = target?.line.product.saleUnit ?? "UNIT";
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PURCHASE_LINE_EXPIRY_SPLIT,
    request: {
      schema: purchaseLineExpirySplitBodySchema,
      from: (values) => purchaseLineExpirySplitRequestFrom(values, saleUnit),
    },
    fields: PURCHASE_LINE_EXPIRY_SPLIT_FIELDS,
    messages: purchaseLineExpirySplitMessages(saleUnit),
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.splitPurchaseLineExpiry(
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
        setNotice({ kind: "notEnoughInLot" });
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
      reset(purchaseLineExpirySplitValuesOf(target.line));
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
      icon={<CalendarClock />}
      context="Stock · Compra"
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
            Guardar el vencimiento
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se corrigió el vencimiento" />
          <form.AppField name="quantity">
            {(field) => (
              <field.TextField
                {...quantityFieldKind(saleUnit)}
                label="Cantidad"
                description={`Quedan ${formatStockQuantity(target.line.remainingInLot, saleUnit)} en el lote`}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="expiresOn">
            {(field) => <field.DateField label="Vencimiento" />}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
