import type {
  CompleteReturnOutcome,
  PreviewReturnOutcome,
  ReturnDraftLineBody,
} from "@purosur/contracts";
import {
  Button,
  Eyebrow,
  FigureStat,
  formatCalendarDayNumeric,
  formatCents,
  formatInvoiceNumber,
  formatPointOfSaleNumber,
  InlineNotice,
  LoadFailure,
  ScreenHeader,
  SidePanel,
  SummaryRowGroup,
  Tag,
  TextField,
} from "@purosur/ui";
import { Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompleteReturnInput } from "../platform/core-client";
import { AuthorizationSection } from "../shell/authorization-section";
import type { AuthorizationState } from "../shell/use-authorization";
import type { CompletedReturnLine } from "./return-completed-modal";
import { ReturnCompletedModal } from "./return-completed-modal";
import type { ReturnDraft, ReturnDraftLine } from "./return-draft";
import {
  changeLine,
  checkLine,
  draftLinesFor,
  EMPTY_RETURN_DRAFT,
  uncheckLine,
} from "./return-draft";
import { ReturnLinesTable } from "./return-lines-table";
import { refundDraftFor, refundsOf } from "./return-refunds";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import {
  lineRefusalNotice,
  paymentIneligibleText,
  paymentMethodName,
  quantityText,
  refundRefusalText,
  windowTags,
} from "./return-text";
import { usePreviewReturnQuery } from "./returns-queries";

const COMPLETE_FAILED = "No se pudo completar la devolución. Probá de nuevo.";

export type ReturnBuildStepProps = {
  sale: SaleForReturn;
  source: "QR" | "TYPED";
  authorization: AuthorizationState;
  previewReturn: (
    saleId: string,
    lines: readonly ReturnDraftLineBody[],
  ) => Promise<PreviewReturnOutcome>;
  completeReturn: (input: CompleteReturnInput) => Promise<CompleteReturnOutcome>;
  onAuthorizationRequired: () => void;
  onLeave: () => void;
  onSessionInvalid: () => void;
};

function lineOf(sale: SaleForReturn, lineId: string): SaleLineForReturn | undefined {
  return sale.lines.find(({ id }) => id === lineId);
}

export function ReturnBuildStep({
  sale,
  source,
  authorization,
  previewReturn,
  completeReturn,
  onAuthorizationRequired,
  onLeave,
  onSessionInvalid,
}: ReturnBuildStepProps) {
  const [draft, setDraft] = useState<ReturnDraft>(EMPTY_RETURN_DRAFT);
  const [refundEdits, setRefundEdits] = useState<Readonly<Record<string, string>>>({});
  const [completing, setCompleting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [completed, setCompleted] = useState<{
    refundedTotal: number;
    lines: CompletedReturnLine[];
  }>();

  const lines = draftLinesFor(sale, draft);
  const preview = usePreviewReturnQuery({
    saleId: sale.sale_id,
    lines,
    preview: previewReturn,
    enabled: lines.length > 0,
  });
  const previewed =
    lines.length > 0 && preview.status === "loaded" && preview.value.kind === "previewed"
      ? preview.value
      : undefined;
  const previewRefreshing = preview.status === "loaded" && preview.refreshing;
  const previewSignedOut =
    lines.length > 0 && preview.status === "loaded" && preview.value.kind === "not_signed_in";
  const saleGone =
    lines.length > 0 &&
    preview.status === "loaded" &&
    (preview.value.kind === "not_found" || preview.value.kind === "sale_not_returnable");

  useEffect(() => {
    if (previewSignedOut) {
      onSessionInvalid();
    }
  }, [previewSignedOut, onSessionInvalid]);

  const refusals = Object.fromEntries(
    (previewed?.lines ?? []).map((line) => [line.sale_line_id, line.refusal]),
  );
  const firstRefusal = previewed?.lines.find((line) => line.refusal !== null);
  const refusedLine =
    firstRefusal === undefined ? undefined : lineOf(sale, firstRefusal.sale_line_id);
  const refundableTotal = previewed?.refundable_total ?? 0;
  const refundDraft = refundDraftFor(sale.payments, refundableTotal, refundEdits);
  const refunds = refundsOf(refundDraft);
  const canComplete =
    !completing &&
    previewed !== undefined &&
    !previewRefreshing &&
    firstRefusal === undefined &&
    refunds.length > 0 &&
    authorization.ready;

  function change(next: ReturnDraft) {
    setDraft(next);
    setRefundEdits({});
    setNotice(undefined);
  }

  async function complete() {
    if (!canComplete || previewed === undefined) {
      return;
    }
    setCompleting(true);
    setNotice(undefined);
    const outcome = await completeReturn({
      saleId: sale.sale_id,
      ticketSource: source,
      lines,
      refunds,
      authorization: authorization.value,
    }).catch((): "failed" => "failed");
    setCompleting(false);
    if (outcome === "failed") {
      setNotice(COMPLETE_FAILED);
      return;
    }
    switch (outcome.kind) {
      case "completed":
        authorization.performed();
        setCompleted({
          refundedTotal: outcome.refunded_total,
          lines: previewed.lines.flatMap((line) => {
            const sold = lineOf(sale, line.sale_line_id);
            return sold === undefined || line.disposition === null
              ? []
              : [
                  {
                    id: sold.id,
                    name: sold.product_name,
                    quantity: quantityText(sold.sale_unit, line.quantity),
                    disposition: line.disposition,
                    amount: line.refund_amount ?? 0,
                  },
                ];
          }),
        });
        break;
      case "not_found":
      case "sale_not_returnable":
        setNotice("Esa venta ya no se puede devolver.");
        break;
      case "no_open_session":
        setNotice("No hay una caja abierta para entregar el dinero.");
        break;
      case "no_lines":
        setNotice("Elegí al menos una línea para devolver.");
        break;
      case "line_refused": {
        const refused = lineOf(sale, outcome.sale_line_id);
        setNotice(
          refused === undefined ? COMPLETE_FAILED : lineRefusalNotice(outcome.refusal, refused),
        );
        break;
      }
      case "refund_refused":
        setNotice(refundRefusalText(outcome.refusal));
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "lacks_permission":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          onAuthorizationRequired();
          setNotice("Elegí quién autoriza e ingresá su PIN.");
        }
        break;
      case "wrong_pin":
      case "rate_limited":
      case "locked":
      case "unavailable":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          setNotice(COMPLETE_FAILED);
        }
        break;
    }
  }

  const authorizer =
    authorization.authorizers.status === "loaded"
      ? authorization.authorizers.value.find(({ id }) => id === authorization.chosen)
      : undefined;
  const authorizedBy =
    authorization.required && authorization.refusal === undefined ? authorizer : undefined;
  const eyebrow =
    sale.invoice === null
      ? "DEVOLUCIÓN"
      : `DEVOLUCIÓN · FACTURA C PV ${formatPointOfSaleNumber(sale.invoice.point_of_sale)} N° ${formatInvoiceNumber(sale.invoice.number)}`;
  const panelNotice =
    firstRefusal?.refusal != null && refusedLine !== undefined
      ? lineRefusalNotice(firstRefusal.refusal, refusedLine)
      : saleGone
        ? "Esa venta ya no se puede devolver."
        : notice;

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-8">
        <ScreenHeader eyebrow={eyebrow} title="Elegí qué devuelve el cliente" />
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-subheading text-text">
            {`Compra del ${formatCalendarDayNumeric(sale.occurred_at.slice(0, 10))}`}
          </p>
          {windowTags(sale.windows).map(({ label, tone }) => (
            <Tag key={label} tone={tone} variant="status">
              {label}
            </Tag>
          ))}
        </div>
        <ReturnLinesTable
          sale={sale}
          draft={draft}
          refusals={refusals}
          onCheck={(line, checked) =>
            change(checked ? checkLine(draft, line) : uncheckLine(draft, line.id))
          }
          onChange={(lineId: string, edit: Partial<ReturnDraftLine>) =>
            change(changeLine(draft, lineId, edit))
          }
        />
      </main>
      <SidePanel
        footer={
          <>
            {authorizedBy === undefined ? (
              <AuthorizationSection
                authorization={authorization}
                action="hacer devoluciones"
                disabled={completing}
              />
            ) : (
              <InlineNotice
                tone="info"
                icon={<ShieldCheck />}
                title={`Autorizó ${authorizedBy.first_name}`}
              />
            )}
            {preview.status === "failed" && lines.length > 0 ? (
              <LoadFailure
                icon={<TriangleAlert />}
                title="No se pudo calcular el reintegro"
                description="Probá de nuevo."
                onRetry={preview.retry}
              />
            ) : null}
            {panelNotice === undefined ? null : (
              <InlineNotice tone="warning" icon={<TriangleAlert />} title={panelNotice} />
            )}
            <Button
              size="large"
              fullWidth
              icon={<Check />}
              disabled={!canComplete}
              dataStatus={completing ? "loading" : "loaded"}
              onPress={() => void complete()}
            >
              Completar devolución
            </Button>
            <Button variant="text" destructive onPress={onLeave}>
              Salir sin completar
            </Button>
          </>
        }
      >
        <FigureStat label="A REINTEGRAR" value={formatCents(refundableTotal)} />
        <SummaryRowGroup
          variant="divided"
          rows={[{ label: "Líneas a devolver", value: String(lines.length) }]}
        />
        <Eyebrow text="SE DEVUELVE POR EL MEDIO DEL PAGO" />
        <ul className="flex flex-col gap-4">
          {refundDraft.map(({ payment, text }) => {
            const name = paymentMethodName(payment.method);
            return (
              <li key={payment.payment_id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body font-bold text-text">{name}</span>
                    <span className="text-detail text-text-subtle">
                      {`Pagó ${formatCents(payment.amount)}`}
                    </span>
                  </div>
                  <div className="w-44 shrink-0">
                    <TextField
                      kind="amount"
                      prefix="$"
                      label={`Reintegro por ${name}`}
                      labelVisuallyHidden
                      inputMode="decimal"
                      value={text}
                      disabled={!payment.eligible}
                      onChange={(value) =>
                        setRefundEdits({ ...refundEdits, [payment.payment_id]: value })
                      }
                    />
                  </div>
                </div>
                {payment.ineligible_reason === null ? null : (
                  <p className="text-detail text-text-subtle">
                    {paymentIneligibleText(payment.ineligible_reason)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </SidePanel>
      {completed === undefined ? null : (
        <ReturnCompletedModal
          refundedTotal={completed.refundedTotal}
          lines={completed.lines}
          onDone={onLeave}
        />
      )}
    </>
  );
}
