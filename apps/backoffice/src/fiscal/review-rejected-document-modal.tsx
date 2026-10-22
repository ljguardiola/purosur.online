import { rejectedDocumentRemedyBodySchema } from "@purosur/contracts";
import {
  Button,
  formatCalendarDayNumeric,
  formatCalendarDayRange,
  formatCents,
  formatInvoiceNumber,
  formatNumber,
  formatPointOfSaleNumber,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  plural,
  useRequestForm,
} from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { ArrowRight, FilePen, FileX, Info, Receipt, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { useAuthorizedAttempt } from "../platform/use-authorized-attempt";
import type { fetchBuyerTaxStatuses } from "./buyer-tax-statuses-api";
import { FixedPair } from "./fiscal-data-pair";
import { useBuyerTaxStatusesQuery } from "./fiscal-queries";
import type { remedyRejectedDocument } from "./fortnight-presentations-api";
import {
  buyerCuitMessage,
  buyerTaxStatusCodeMessage,
  buyerTaxStatusOptions,
  correctionRefusalField,
  correctionRefusalMessage,
  EMPTY_REMEDY_FORM,
  issuedOnMessage,
  type RemedyTarget,
  remedyFormValuesFrom,
  remedyRequestFrom,
  totalMessage,
} from "./rejected-document-remedy-form";

export type ReviewRejectedDocumentModalServices = {
  remedyRejectedDocument: typeof remedyRejectedDocument;
  fetchBuyerTaxStatuses: typeof fetchBuyerTaxStatuses;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ReviewRejectedDocumentModalProps = {
  target: RemedyTarget | null;
  onClose: () => void;
  onRemedied: (target: RemedyTarget) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: ReviewRejectedDocumentModalServices;
};

type SpecificNotice = "notFound" | "notRejected" | "alreadyRemedied" | "nothingChanged" | "invalid";

const WHERE_OPTIONS = [
  {
    value: "report",
    label: "En el informe",
    description: "Coincide con lo impreso",
    icon: <FilePen />,
  },
  {
    value: "printed",
    label: "En el comprobante impreso",
    description: "Lo impreso está mal",
    icon: <Receipt />,
  },
] as const;

const BUYER_OPTIONS = [
  { value: "final_consumer", label: "Consumidor final" },
  { value: "cuit", label: "Con CUIT" },
] as const;

function unprocessedSentence(unprocessed: number): string {
  if (unprocessed === 0) {
    return "";
  }
  return plural(unprocessed, {
    one: " El comprobante sin procesar se presenta aparte.",
    other: ` Los ${formatNumber(unprocessed)} comprobantes sin procesar se presentan aparte.`,
  });
}

export function ReviewRejectedDocumentModal({
  target,
  onClose,
  onRemedied,
  onOutdated,
  onSessionEnded,
  services,
}: ReviewRejectedDocumentModalProps) {
  const {
    remedyRejectedDocument,
    fetchBuyerTaxStatuses,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const [seededFrom, setSeededFrom] = useState<RemedyTarget | null>(null);
  const {
    attempt,
    running,
    notice,
    modal: authorizationModal,
  } = useAuthorizedAttempt<Awaited<ReturnType<typeof remedyRejectedDocument>>, SpecificNotice>({
    open,
    actionName: "Corregir el informe rechazado",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, values, reset } = useRequestForm({
    defaultValues: EMPTY_REMEDY_FORM,
    request: { schema: rejectedDocumentRemedyBodySchema, from: remedyRequestFrom },
    fields: {
      point_of_sale_number: null,
      fortnight_start: null,
      document_type: null,
      number: null,
      remedy: null,
      "remedy.correction.issued_on": "issuedOn",
      "remedy.correction.total": "total",
      "remedy.correction.buyer": ({ buyerKind }) =>
        buyerKind === "cuit" ? "buyerCuit" : "buyerTaxStatusCode",
      "remedy.correction.buyer.number": "buyerCuit",
      "remedy.correction.buyer_tax_status_code": "buyerTaxStatusCode",
    },
    messages: {
      issuedOn: issuedOnMessage,
      total: totalMessage,
      buyerCuit: buyerCuitMessage,
      buyerTaxStatusCode: buyerTaxStatusCodeMessage,
    },
    onSubmit: async (request, { showWireFieldError, showFieldError, values: submitted }) => {
      if (target === null) {
        return;
      }
      await attempt(
        () => remedyRejectedDocument(request),
        (outcome, opening) => {
          if (outcome.kind === "ok") {
            if (opening.current) {
              onClose();
            }
            onRemedied(target);
          } else if (outcome.kind === "validation_failed") {
            if (!showWireFieldError(outcome.field)) {
              opening.showNotice("invalid");
            }
          } else if (outcome.kind === "correction_refused") {
            const field = correctionRefusalField(outcome.refusal, submitted);
            if (field === null) {
              opening.showNotice("nothingChanged");
            } else {
              showFieldError(field, correctionRefusalMessage(outcome.refusal, target.fortnight));
            }
          } else if (outcome.kind === "not_found") {
            opening.showNotice("notFound");
            onOutdated();
          } else if (outcome.kind === "not_rejected") {
            opening.showNotice("notRejected");
            onOutdated();
          } else if (outcome.kind === "already_remedied") {
            opening.showNotice("alreadyRemedied");
            onOutdated();
          }
        },
      );
    },
  });

  useEffect(() => {
    if (target === null) {
      if (seededFrom !== null) {
        reset();
        setSeededFrom(null);
      }
    } else if (target !== seededFrom) {
      reset(remedyFormValuesFrom(target));
      setSeededFrom(target);
    }
  }, [target, seededFrom, reset]);

  const printed = values.errorIn === "printed";
  const taxStatuses = useBuyerTaxStatusesQuery({
    fetchBuyerTaxStatuses,
    enabled: open && printed,
    onSessionEnded,
  });
  const busy = running || submitting;
  const rejected = target?.rejectedDocument;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="error"
        icon={<FileX />}
        context={
          target
            ? `Informe ${formatCalendarDayRange(target.fortnight.start, target.fortnight.end)} · Punto de venta ${formatPointOfSaleNumber(target.pointOfSaleNumber)}`
            : ""
        }
        title="Revisar el rechazo"
        closable
        footer={
          <>
            <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<ArrowRight />}
              fullWidth
              disabled={busy}
              {...(printed ? { dataStatus: taxStatuses.status } : {})}
              onPress={() => void submit()}
            >
              {printed ? "Corregir y anular con nota de crédito" : "Corregir el informe"}
            </Button>
          </>
        }
      >
        {target && rejected ? (
          <div className="flex flex-col gap-4">
            {notice?.kind === "notFound" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="Este comprobante ya no está en el informe."
              />
            )}
            {notice?.kind === "notRejected" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="ARCA ya no tiene rechazado este comprobante."
              />
            )}
            {notice?.kind === "alreadyRemedied" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="Este comprobante ya se corrigió y espera volver a presentarse."
              />
            )}
            {notice?.kind === "nothingChanged" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={correctionRefusalMessage("nothing_changed", target.fortnight)}
              />
            )}
            {notice?.kind === "invalid" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="Revisá los datos del comprobante."
              />
            )}
            {notice?.kind === "attemptFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo corregir el informe"
                description="Probá de nuevo."
              />
            )}
            {notice?.kind === "rateLimited" && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title="Demasiadas solicitudes"
                description={retryAfterDetail(notice.retryAfterSeconds)}
              />
            )}
            <div className="flex flex-col gap-3 rounded-lg bg-surface-subtle p-4">
              <div className="flex gap-6">
                <FixedPair label="Comprobante" value="Factura C · CAEA" />
                <FixedPair label="Número" value={`Nº ${formatInvoiceNumber(rejected.number)}`} />
                <FixedPair label="Fecha" value={formatCalendarDayNumeric(rejected.issuedOn)} />
                <FixedPair label="Total" value={formatCents(rejected.total)} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-bold text-text-subtle text-detail">Lo que informó ARCA</p>
                {rejected.rejections.map(({ code, message }) => (
                  <p key={code} className="text-body text-error-strong">
                    {message}
                  </p>
                ))}
              </div>
            </div>
            <form.AppField name="errorIn">
              {(field) => (
                <field.OptionCardGroup label="¿Dónde está el error?" options={WHERE_OPTIONS} />
              )}
            </form.AppField>
            {printed ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <form.AppField name="issuedOn">
                    {(field) => <field.DateField label="Fecha" />}
                  </form.AppField>
                  <form.AppField name="total">
                    {(field) => (
                      <field.TextField kind="price" label="Total" prefix="$" inputMode="decimal" />
                    )}
                  </form.AppField>
                </div>
                <form.AppField name="buyerKind">
                  {(field) => <field.SegmentedControl label="Comprador" options={BUYER_OPTIONS} />}
                </form.AppField>
                {values.buyerKind === "cuit" ? (
                  <form.AppField name="buyerCuit">
                    {(field) => (
                      <field.TextField
                        kind="plain-text"
                        label="CUIT del comprador"
                        inputMode="numeric"
                      />
                    )}
                  </form.AppField>
                ) : null}
                {taxStatuses.status === "loading" ? (
                  <LoadingPlaceholder variant="form" fields={1} />
                ) : null}
                {taxStatuses.status === "failed" ? (
                  <LoadFailure
                    {...cloudLoadFailure(taxStatuses, "las condiciones frente al IVA")}
                  />
                ) : null}
                {taxStatuses.status === "loaded" ? (
                  <form.AppField name="buyerTaxStatusCode">
                    {(field) => (
                      <field.Select
                        label="Condición frente al IVA"
                        options={buyerTaxStatusOptions(
                          taxStatuses.value,
                          rejected.buyerTaxStatusCode,
                        )}
                      />
                    )}
                  </form.AppField>
                ) : null}
              </div>
            ) : null}
            <InlineNotice
              tone="info"
              icon={<Info />}
              description={
                printed
                  ? `Se informa el comprobante con la corrección, con el mismo número, y se emite una nota de crédito por su total para anularlo.${unprocessedSentence(rejected.unprocessed)}`
                  : `Se corrige el informe y se vuelve a presentar con el mismo número.${unprocessedSentence(rejected.unprocessed)}`
              }
            />
          </div>
        ) : null}
      </Modal>
      {authorizationModal}
    </>
  );
}
