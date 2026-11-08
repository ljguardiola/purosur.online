import type { PurchaseSummary } from "@purosur/contracts";
import { purchaseLineExpiryCorrectionBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { CalendarClock, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import {
  EMPTY_PURCHASE_LINE_EXPIRY,
  PURCHASE_LINE_EXPIRY_FIELDS,
  PURCHASE_LINE_EXPIRY_MESSAGES,
  purchaseLineExpiryRequestFrom,
  purchaseLineExpiryValuesOf,
} from "./purchase-line-expiry-form";
import type { correctPurchaseLineExpiry } from "./purchases-api";

export type CorrectPurchaseLineExpiryModalServices = {
  correctPurchaseLineExpiry: typeof correctPurchaseLineExpiry;
};

export type PurchaseLineExpiryTarget = {
  purchase: PurchaseSummary;
  line: PurchaseSummary["lines"][number];
};

type CorrectPurchaseLineExpiryModalProps = {
  target: PurchaseLineExpiryTarget | null;
  services: CorrectPurchaseLineExpiryModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function CorrectPurchaseLineExpiryModal({
  target,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: CorrectPurchaseLineExpiryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseLineExpiryTarget | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PURCHASE_LINE_EXPIRY,
    request: {
      schema: purchaseLineExpiryCorrectionBodySchema,
      from: purchaseLineExpiryRequestFrom,
    },
    fields: PURCHASE_LINE_EXPIRY_FIELDS,
    messages: PURCHASE_LINE_EXPIRY_MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.correctPurchaseLineExpiry(
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
      reset(purchaseLineExpiryValuesOf(target.line));
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
            Guardar el vencimiento
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se corrigió el vencimiento" />
          <form.AppField name="expiresOn">
            {(field) => <field.DateField label="Vencimiento" />}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
