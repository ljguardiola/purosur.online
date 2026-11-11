import type { Authorization, CancelPaidSaleOutcome, SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button, formatCents, InlineNotice, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft, CircleX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { AuthorizationModal } from "../shell/authorization-modal";
import type { Refund } from "../shell/refund-lines";
import { RefundLines } from "../shell/refund-lines";
import { useAuthorization } from "../shell/use-authorization";

const FAILED_MESSAGE = "No se pudo cancelar la venta. Probá de nuevo.";
const QR_CHARGE_IN_PROGRESS_MESSAGE =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.";
const AUTHORIZING = "cancelar una venta con pagos";

export type CancelPaidSaleModalProps = {
  saleId: string;
  total: number;
  paid: number;
  refunds: readonly Refund[];
  authorizationRequired: boolean;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  cancelPaidSale: (
    saleId: string,
    authorization: Authorization | undefined,
  ) => Promise<CancelPaidSaleOutcome>;
  onCancelled: (refunds: Refund[]) => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function CancelPaidSaleModal({
  saleId,
  total,
  paid,
  refunds,
  authorizationRequired,
  loadAuthorizers,
  cancelPaidSale,
  onCancelled,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: CancelPaidSaleModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const authorization = useAuthorization({
    permission: "void_sale",
    required: authorizationRequired,
    loadAuthorizers,
  });

  async function confirm() {
    if (submitting) {
      return;
    }
    if (!authorization.ready) {
      authorization.ask();
      return;
    }
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await cancelPaidSale(saleId, authorization.value).catch(
      (): "failed" => "failed",
    );
    setSubmitting(false);
    authorization.dismiss();
    if (outcome === "failed") {
      setNotice(FAILED_MESSAGE);
      return;
    }
    switch (outcome.kind) {
      case "cancelled":
        authorization.performed();
        onCancelled(outcome.refunds);
        break;
      case "no_open_sale":
        onSaleGone();
        break;
      case "no_open_session":
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "not_permitted":
        setNotice("No tenés el permiso de vender y cobrar");
        break;
      case "wrong_pin":
      case "rate_limited":
      case "locked":
      case "lacks_permission":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else if (outcome.kind === "lacks_permission") {
          setNotice(`Ya no tenés permiso para ${AUTHORIZING}.`);
        } else {
          setNotice(FAILED_MESSAGE);
        }
        break;
      case "mercado_pago_charge_in_progress":
        setNotice(QR_CHARGE_IN_PROGRESS_MESSAGE);
        break;
      case "unavailable":
        setNotice(FAILED_MESSAGE);
        break;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      width="confirmation"
      tone="error"
      icon={<CircleX />}
      context="Venta en curso · Con pagos"
      title="¿Cancelar la venta?"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onClose}
          >
            Seguir con la venta
          </Button>
          <Button
            destructive
            size="large"
            icon={<X />}
            fullWidth
            disabled={submitting}
            onPress={() => void confirm()}
          >
            Cancelar la venta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SummaryRowGroup
          rows={[
            { label: "Total", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid), strong: true },
          ]}
        />
        <RefundLines refunds={refunds} />
        <AuthorizationModal
          authorization={authorization}
          subtitle="Cancelar venta con pagos"
          action={AUTHORIZING}
          submitting={submitting}
          onConfirm={() => void confirm()}
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
