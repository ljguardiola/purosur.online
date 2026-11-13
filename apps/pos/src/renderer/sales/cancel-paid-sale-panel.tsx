import type { Authorization, CancelPaidSaleOutcome, SignInUser } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { ConfirmationPanel, formatCents } from "@purosur/ui";
import { Ban } from "lucide-react";
import { useState } from "react";
import { useKeys } from "../platform/key-layer";
import { paymentMethodName } from "../platform/payment-method-names";
import { AuthorizationModal } from "../shell/authorization-modal";
import type { Refund } from "../shell/refund-lines";
import { useAuthorization } from "../shell/use-authorization";

const FAILED_MESSAGE = "No se pudo cancelar la venta. Probá de nuevo.";
const QR_CHARGE_IN_PROGRESS_MESSAGE =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.";
const AUTHORIZING = "cancelar una venta con pagos";

export type CancelPaidSalePanelProps = {
  saleId: string;
  total: number;
  refundNow: number;
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

function refundMethodName(method: Refund["method"]): string {
  return method === "QR" ? "QR" : paymentMethodName(method);
}

function refundLabel(refund: Refund): string {
  const when = refund.state === "PENDING" ? "reembolso pendiente" : "en el acto";
  return `${refundMethodName(refund.method)} · ${when}`;
}

export function CancelPaidSalePanel({
  saleId,
  total,
  refundNow,
  refunds,
  authorizationRequired,
  loadAuthorizers,
  cancelPaidSale,
  onCancelled,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: CancelPaidSalePanelProps) {
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

  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!submitting) {
          onClose();
        }
      },
    },
  ]);
  useKeys([{ key: "Enter", run: () => void confirm() }], { fallback: true });

  return (
    <>
      <ConfirmationPanel
        title="Cancelar venta"
        icon={<Ban />}
        tone="error"
        locked={authorizationRequired}
        fieldLabel="A DEVOLVER AHORA"
        value={formatCents(refundNow)}
        details={[
          { label: "Total", value: formatCents(total) },
          ...refunds.map((refund) => ({
            label: refundLabel(refund),
            value: formatCents(refund.amount),
          })),
        ]}
        actionLabel="Cancelar venta"
        actionIcon={<Ban />}
        busy={submitting}
        {...(notice === undefined ? {} : { notice })}
        onClose={onClose}
        onConfirm={() => void confirm()}
      />
      <AuthorizationModal
        authorization={authorization}
        subtitle="Cancelar venta con pagos"
        action={AUTHORIZING}
        submitting={submitting}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
