import { type PendingRefundsBody, refundTransferSchema } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Landmark, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  EMPTY_REFUND_TRANSFER_FORM,
  REFUND_TRANSFER_FIELDS,
  REFUND_TRANSFER_KIND_OPTIONS,
  REFUND_TRANSFER_MESSAGES,
  refundTransferRequestFrom,
} from "./refund-transfer-form";
import type { recordRefundTransfer } from "./refunds-api";

export type TransferRefundModalServices = {
  recordRefundTransfer: typeof recordRefundTransfer;
};

type PendingRefund = PendingRefundsBody["refunds"][number];

type TransferRefundModalProps = {
  target: PendingRefund | null;
  onClose: () => void;
  onDone: () => void;
  onSessionEnded: () => void;
  services: TransferRefundModalServices;
};

type TransferNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "alreadyDone" }
  | { kind: "discarded" }
  | { kind: "notRefusedForGood" }
  | { kind: "notFound" };

const STALE_NOTICE_KINDS = {
  already_done: "alreadyDone",
  discarded: "discarded",
  not_refused_for_good: "notRefusedForGood",
  not_found: "notFound",
} as const;

export function TransferRefundModal({
  target,
  onClose,
  onDone,
  onSessionEnded,
  services,
}: TransferRefundModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<PendingRefund | null>(null);
  const [notice, setNotice] = useState<TransferNotice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_REFUND_TRANSFER_FORM,
    request: { schema: refundTransferSchema, from: refundTransferRequestFrom },
    fields: REFUND_TRANSFER_FIELDS,
    messages: REFUND_TRANSFER_MESSAGES,
    onSubmit: async (_request, { parsed, showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      const outcome = await services.recordRefundTransfer(target.id, parsed);
      if (outcome.kind === "ok") {
        onDone();
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
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      if (
        outcome.kind === "already_done" ||
        outcome.kind === "discarded" ||
        outcome.kind === "not_refused_for_good" ||
        outcome.kind === "not_found"
      ) {
        setNotice({ kind: STALE_NOTICE_KINDS[outcome.kind] });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (target) {
      reset();
      setShown(target);
      setNotice(null);
    }
  }, [target, reset]);

  const listOutdated =
    notice !== null && notice.kind !== "attemptFailed" && notice.kind !== "rateLimited";

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Landmark />}
      title={
        shown
          ? `¿Registrar la devolución por transferencia del reembolso de ${formatCents(shown.amount)}?`
          : ""
      }
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
          {listOutdated ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={submitting}
              onPress={onDone}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<Landmark />}
              fullWidth
              disabled={submitting}
              onPress={() => void submit()}
            >
              Registrar transferencia
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <ActionFailureNotice
            title="No se registró la transferencia"
            description="Volvé a intentarlo."
          />
        )}
        {notice?.kind === "alreadyDone" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Ya estaba marcado como hecho"
          />
        )}
        {notice?.kind === "discarded" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Ya estaba descartado" />
        )}
        {notice?.kind === "notRefusedForGood" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Mercado Pago ya no tiene este reembolso rechazado; no se puede registrar por transferencia."
          />
        )}
        {notice?.kind === "notFound" && (
          <InlineNotice tone="error" icon={<TriangleAlert />} title="Este reembolso ya no existe" />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
        <form.AppField name="kind">
          {(field) => (
            <field.Select
              label="Tipo de transferencia"
              placeholder="Elegí un tipo"
              options={REFUND_TRANSFER_KIND_OPTIONS}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="operationNumber">
          {(field) => <field.TextField kind="plain-text" label="Número de operación" required />}
        </form.AppField>
      </div>
    </Modal>
  );
}
