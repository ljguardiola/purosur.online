import type {
  Authorization,
  SaleCreditNote,
  SignInUser,
  VoidSaleOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  Checkbox,
  FigureStat,
  formatCents,
  InlineNotice,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
} from "@purosur/ui";
import { CircleX, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { AuthorizationModal } from "../shell/authorization-modal";
import { useRefuseBarcodeReadings } from "../shell/barcode-readings";
import { FramePanel } from "../shell/register-frame";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { useAuthorization } from "../shell/use-authorization";
import type { VoidCreditNoteCorrects, VoidRefund } from "./void-sale-text";
import { voidRefundRow, voidRefusalReason } from "./void-sale-text";

export type { VoidCreditNoteCorrects, VoidRefund } from "./void-sale-text";

const FAILED_MESSAGE = "No se pudo anular la venta. Probá de nuevo.";
const UNCONFIRMED_MESSAGE = "Confirmá los reembolsos pendientes antes de anular la venta.";
const NOT_COMPLETED_REASON = "La venta ya no se puede anular.";
const AUTHORIZING = "anular ventas";

export type VoidSalePanelProps = {
  sale: Pick<SaleDetail, "sale_id" | "total">;
  refunds: readonly VoidRefund[];
  creditNoteCorrects: VoidCreditNoteCorrects;
  authorizationRequired: boolean;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  voidSale: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
  onVoided: (creditNote: SaleCreditNote | null) => void;
  onRefused: () => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function VoidSalePanel({
  sale,
  refunds,
  creditNoteCorrects,
  authorizationRequired,
  loadAuthorizers,
  voidSale,
  onVoided,
  onRefused,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: VoidSalePanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [refusalReason, setRefusalReason] = useState<string>();
  const [confirmed, setConfirmed] = useState<readonly number[]>([]);
  const sending = useRef(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const authorization = useAuthorization({
    permission: "void_sale",
    required: authorizationRequired,
    loadAuthorizers,
  });

  const shown = refunds.map((refund, position) => ({
    position,
    amount: refund.amount,
    ...voidRefundRow(refund),
  }));
  const pending = shown.flatMap((refund) => (refund.pending ? [refund.position] : []));
  const allConfirmed = pending.every((position) => confirmed.includes(position));
  const returnedNow = shown.reduce(
    (sum, refund) => (refund.pending ? sum : sum + refund.amount),
    0,
  );

  async function confirm() {
    if (sending.current || refusalReason !== undefined || !allConfirmed) {
      return;
    }
    if (!authorization.ready) {
      authorization.ask();
      return;
    }
    sending.current = true;
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await voidSale(sale.sale_id, pending.length > 0, authorization.value).catch(
      (): "failed" => "failed",
    );
    sending.current = false;
    setSubmitting(false);
    authorization.dismiss();
    if (outcome === "failed") {
      setNotice(FAILED_MESSAGE);
      return;
    }
    switch (outcome.kind) {
      case "voided":
        authorization.performed();
        onVoided(outcome.credit_note);
        break;
      case "not_found":
        onSaleGone();
        break;
      case "not_signed_in":
        onSessionInvalid();
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
      case "pending_refunds_unconfirmed":
        setNotice(UNCONFIRMED_MESSAGE);
        break;
      case "not_completed":
      case "session_closed":
      case "invoice_in_flight":
        setRefusalReason(voidRefusalReason(outcome.kind) ?? NOT_COMPLETED_REASON);
        onRefused();
        break;
      case "unavailable":
        setNotice(FAILED_MESSAGE);
        break;
    }
  }

  function focusWhenShown(node: HTMLDivElement | null) {
    panel.current = node;
    node?.focus();
  }
  useKeys([{ key: "Escape", run: submitting ? () => {} : onClose }], { fallback: true });
  useKeys([{ key: "Enter", run: () => void confirm() }], { fallback: true, within: panel });
  useRefuseBarcodeReadings(true);

  return (
    <FramePanel>
      <div ref={focusWhenShown} tabIndex={-1} className="flex h-full outline-none">
        <SidePanel
          label="Anular venta"
          header={
            <SidePanelTitle
              title="Anular venta"
              icon={<CircleX />}
              tone="error"
              locked={authorizationRequired}
              onClose={onClose}
              closeDisabled={submitting}
            />
          }
          footer={
            <Button
              destructive
              size="large"
              fullWidth
              icon={<CircleX />}
              iconPosition="start"
              keycap="Enter"
              disabled={submitting || !allConfirmed}
              {...(refusalReason === undefined ? {} : { disabledReason: refusalReason })}
              onPress={() => void confirm()}
            >
              Anular venta
            </Button>
          }
        >
          <FigureStat
            label="A DEVOLVER AHORA"
            size="hero"
            variant="plain"
            value={formatCents(returnedNow)}
          />
          <SummaryRowGroup
            rows={[
              { label: "Total", value: formatCents(sale.total) },
              ...shown.map(({ label, value }) => ({ label, value })),
              {
                label: "Nota de crédito C",
                value: creditNoteCorrects === null ? "No se emite" : "Se emite e imprime",
              },
            ]}
          />
          {shown.map((refund) =>
            refund.pending ? (
              <Checkbox
                key={refund.position}
                name={`confirm-refund-${refund.position}`}
                checked={confirmed.includes(refund.position)}
                disabled={submitting}
                onCheckedChange={(checked) =>
                  setConfirmed(
                    checked
                      ? [...confirmed, refund.position]
                      : confirmed.filter((other) => other !== refund.position),
                  )
                }
              >
                {`Confirmo el reembolso de ${refund.name}`}
              </Checkbox>
            ) : null,
          )}
          <AuthorizationModal
            authorization={authorization}
            subtitle="Anular venta"
            action={AUTHORIZING}
            submitting={submitting}
            onConfirm={() => void confirm()}
          />
          {notice === undefined ? null : (
            <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
          )}
        </SidePanel>
      </div>
    </FramePanel>
  );
}
