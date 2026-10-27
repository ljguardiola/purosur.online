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
  useRequestForm,
} from "@purosur/ui";
import { Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompleteReturnInput } from "../platform/core-client";
import { AuthorizationSection } from "../shell/authorization-section";
import type { AuthorizationState } from "../shell/use-authorization";
import type { CompletedReturn } from "./hand-over-refund-modal";
import type { ReturnDraft, ReturnFormValues } from "./return-form";
import {
  changeLine,
  checkLine,
  draftLinesFor,
  EMPTY_RETURN_FORM,
  INVALID_REFUND_MESSAGE,
  RETURN_FIELDS,
  refundTextsFor,
  returnRequestFrom,
  returnRequestSchema,
  uncheckLine,
} from "./return-form";
import { ReturnLinesTable } from "./return-lines-table";
import { ReturnRefundsField } from "./return-refunds-field";
import type { SaleForReturn, SaleLineForReturn } from "./return-sale";
import { lineRefusalNotice, quantityText, refundRefusalText, windowTags } from "./return-text";
import { usePreviewReturnQuery } from "./returns-queries";

const COMPLETE_FAILED = "No se pudo completar la devolución. Probá de nuevo.";
const SALE_GONE = "Esa venta ya no se puede devolver.";
const NOT_PERMITTED = "No tenés permiso para hacer devoluciones.";

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
  onCompleted: (completed: CompletedReturn) => void;
  onLeave: () => void;
  onSessionInvalid: () => void;
};

type ReturnRequest = ReturnType<typeof returnRequestFrom>;

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
  onCompleted,
  onLeave,
  onSessionInvalid,
}: ReturnBuildStepProps) {
  const [notice, setNotice] = useState<string>();
  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_RETURN_FORM,
    request: { schema: returnRequestSchema, from: requestFrom },
    fields: RETURN_FIELDS,
    messages: { refunds: INVALID_REFUND_MESSAGE },
    onSubmit: (request) => complete(request),
  });

  const lines = draftLinesFor(sale, values.lines);
  const preview = usePreviewReturnQuery({
    saleId: sale.sale_id,
    lines,
    preview: previewReturn,
    enabled: lines.length > 0,
  });
  const answered = lines.length > 0 && preview.status === "loaded" ? preview.value : undefined;
  const previewed = answered?.kind === "previewed" ? answered : undefined;
  const previewRefreshing = preview.status === "loaded" && preview.refreshing;
  const previewSignedOut = answered?.kind === "not_signed_in";

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
  const refundTexts = refundTextsFor(sale.payments, refundableTotal, values.refunds);
  const canComplete =
    !submitting &&
    previewed !== undefined &&
    !previewRefreshing &&
    firstRefusal === undefined &&
    authorization.ready;

  function requestFrom(formValues: ReturnFormValues): ReturnRequest {
    return returnRequestFrom(sale, refundableTotal, formValues);
  }

  function change(next: ReturnDraft) {
    form.setFieldValue("lines", next);
    form.setFieldValue("refunds", {});
    setNotice(undefined);
  }

  async function complete(request: ReturnRequest) {
    if (previewed === undefined) {
      return;
    }
    setNotice(undefined);
    const outcome = await completeReturn({
      saleId: sale.sale_id,
      ticketSource: source,
      lines: request.lines,
      refunds: request.refunds,
      authorization: authorization.value,
    }).catch((): "failed" => "failed");
    if (outcome === "failed") {
      setNotice(COMPLETE_FAILED);
      return;
    }
    switch (outcome.kind) {
      case "completed":
        authorization.performed();
        onCompleted({
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
        setNotice(SALE_GONE);
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
      : answered?.kind === "not_found" || answered?.kind === "sale_not_returnable"
        ? SALE_GONE
        : answered?.kind === "lacks_permission"
          ? NOT_PERMITTED
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
          draft={values.lines}
          refusals={refusals}
          onCheck={(line, checked) =>
            change(checked ? checkLine(values.lines, line) : uncheckLine(values.lines, line.id))
          }
          onChange={(lineId, edit) => change(changeLine(values.lines, lineId, edit))}
        />
      </main>
      <SidePanel
        footer={
          <>
            {authorizedBy === undefined ? (
              <AuthorizationSection
                authorization={authorization}
                action="hacer devoluciones"
                disabled={submitting}
              />
            ) : (
              <InlineNotice
                tone="info"
                icon={<ShieldCheck />}
                title={`Autorizó ${authorizedBy.first_name}`}
              />
            )}
            {panelNotice === undefined ? null : (
              <InlineNotice tone="warning" icon={<TriangleAlert />} title={panelNotice} />
            )}
            <Button
              size="large"
              fullWidth
              icon={<Check />}
              disabled={!canComplete}
              dataStatus={submitting ? "loading" : "loaded"}
              onPress={() => void submit()}
            >
              Completar devolución
            </Button>
            <Button variant="text" destructive disabled={submitting} onPress={onLeave}>
              Salir sin completar
            </Button>
          </>
        }
      >
        {lines.length > 0 && preview.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo calcular el reintegro"
            description="Probá de nuevo."
            onRetry={preview.retry}
          />
        ) : lines.length > 0 && preview.status === "loading" ? (
          <FigureStat label="A REINTEGRAR" loading />
        ) : (
          <FigureStat label="A REINTEGRAR" value={formatCents(refundableTotal)} />
        )}
        <SummaryRowGroup
          variant="divided"
          rows={[{ label: "Líneas a devolver", value: String(lines.length) }]}
        />
        <Eyebrow text="SE DEVUELVE POR EL MEDIO DEL PAGO" />
        <form.AppField name="refunds">
          {() => <ReturnRefundsField texts={refundTexts} disabled={submitting} />}
        </form.AppField>
      </SidePanel>
    </>
  );
}
