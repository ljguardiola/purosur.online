import { type PurchaseSummary, purchaseHeaderCorrectionBodySchema } from "@purosur/contracts";
import { Button, Modal, useRequestForm } from "@purosur/ui";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type PurchaseCorrectionNotice,
  PurchaseCorrectionNotices,
} from "./purchase-correction-notices";
import { RECEIPT_TYPE_OPTIONS } from "./purchase-form";
import {
  EMPTY_PURCHASE_HEADER,
  PURCHASE_HEADER_FIELDS,
  PURCHASE_HEADER_MESSAGES,
  purchaseHeaderCorrectionRequestFrom,
  purchaseHeaderValuesOf,
} from "./purchase-header-form";
import type { correctPurchaseHeader } from "./purchases-api";

export type CorrectPurchaseHeaderModalServices = {
  correctPurchaseHeader: typeof correctPurchaseHeader;
};

type CorrectPurchaseHeaderModalProps = {
  target: PurchaseSummary | null;
  services: CorrectPurchaseHeaderModalServices;
  onSaved: (purchase: PurchaseSummary) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function CorrectPurchaseHeaderModal({
  target,
  services,
  onSaved,
  onClose,
  onSessionEnded,
}: CorrectPurchaseHeaderModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PurchaseSummary | null>(null);
  const [notice, setNotice] = useState<PurchaseCorrectionNotice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_PURCHASE_HEADER,
    request: {
      schema: purchaseHeaderCorrectionBodySchema,
      from: purchaseHeaderCorrectionRequestFrom,
    },
    fields: PURCHASE_HEADER_FIELDS,
    messages: PURCHASE_HEADER_MESSAGES,
    onSubmit: async (_request, { parsed, showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      const outcome = await services.correctPurchaseHeader(target.id, parsed);
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
      reset(purchaseHeaderValuesOf(target));
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
      icon={<Pencil />}
      context="Stock · Compra"
      title={shown?.supplier.name ?? ""}
      closable
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
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <PurchaseCorrectionNotices notice={notice} failedTitle="No se corrigieron los datos" />
          <form.AppField name="purchasedOn">
            {(field) => <field.DateField label="Fecha de compra" required />}
          </form.AppField>
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <form.AppField name="receiptType">
                {(field) => (
                  <field.Select
                    label="Tipo de comprobante"
                    placeholder="Elegí un tipo"
                    options={RECEIPT_TYPE_OPTIONS}
                    required
                  />
                )}
              </form.AppField>
            </div>
            <div className="min-w-0 flex-1">
              <form.AppField name="receiptNumber">
                {(field) => <field.TextField kind="plain-text" label="Número de comprobante" />}
              </form.AppField>
            </div>
          </div>
          <form.AppField name="note">
            {(field) => <field.TextField kind="plain-text" label="Nota" />}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
