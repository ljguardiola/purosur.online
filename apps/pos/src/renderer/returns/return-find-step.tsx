import type { FindSaleForReturnOutcome } from "@purosur/contracts";
import {
  Button,
  Card,
  EmptyState,
  Eyebrow,
  InlineNotice,
  ScreenHeader,
  SidePanel,
  useRequestForm,
} from "@purosur/ui";
import { Info, ScanBarcode, Search, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import type { SaleForReturnReading } from "../platform/core-client";
import { AuthorizationSection } from "../shell/authorization-section";
import { useBarcodeReadings } from "../shell/barcode-readings";
import type { AuthorizationState } from "../shell/use-authorization";
import type { SaleForReturn } from "./return-sale";
import type { FindRefusalKind } from "./return-text";
import { findRefusalText } from "./return-text";
import {
  EMPTY_RETURN_TICKET_FORM,
  INVALID_INVOICE_NUMBER_MESSAGE,
  INVALID_POINT_OF_SALE_MESSAGE,
  returnTicketRequestFrom,
  returnTicketRequestSchema,
  scannedReturnReading,
} from "./return-ticket-form";

export type ReturnFindStepProps = {
  authorization: AuthorizationState;
  findSaleForReturn: (
    reading: SaleForReturnReading,
    authorization: AuthorizationState["value"],
  ) => Promise<FindSaleForReturnOutcome>;
  onFound: (sale: SaleForReturn, source: "QR" | "TYPED") => void;
  onAuthorizationRequired: () => void;
  onSessionInvalid: () => void;
};

export function ReturnFindStep({
  authorization,
  findSaleForReturn,
  onFound,
  onAuthorizationRequired,
  onSessionInvalid,
}: ReturnFindStepProps) {
  const [refusal, setRefusal] = useState<FindRefusalKind>();
  const finding = useRef(false);

  async function look(reading: SaleForReturnReading) {
    if (finding.current) {
      return;
    }
    finding.current = true;
    setRefusal(undefined);
    const outcome = await findSaleForReturn(reading, authorization.value)
      .catch((): "failed" => "failed")
      .finally(() => {
        finding.current = false;
      });
    if (outcome === "failed") {
      setRefusal("unavailable");
      return;
    }
    switch (outcome.kind) {
      case "found":
        onFound(outcome.sale, reading.kind === "typed" ? "TYPED" : "QR");
        break;
      case "not_found":
      case "voided":
        setRefusal(outcome.kind);
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "lacks_permission":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          onAuthorizationRequired();
          setRefusal("lacks_permission");
        }
        break;
      case "wrong_pin":
      case "rate_limited":
      case "locked":
      case "unavailable":
        if (authorization.required) {
          authorization.refuse(outcome);
        } else {
          setRefusal("unavailable");
        }
        break;
    }
  }

  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_RETURN_TICKET_FORM,
    request: { schema: returnTicketRequestSchema, from: returnTicketRequestFrom },
    fields: {
      reading: null,
      "reading.point_of_sale": "pointOfSale",
      "reading.number": "number",
    },
    messages: {
      pointOfSale: INVALID_POINT_OF_SALE_MESSAGE,
      number: INVALID_INVOICE_NUMBER_MESSAGE,
    },
    onSubmit: ({ reading }) => look(reading),
  });

  function takeScan(text: string) {
    const reading = scannedReturnReading(text);
    if (reading === undefined) {
      setRefusal("not_a_ticket_qr");
    } else {
      void look(reading);
    }
  }
  useBarcodeReadings(takeScan);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitting) {
      void submit();
    }
  }

  const notice = refusal === undefined ? undefined : findRefusalText(refusal);

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader
          eyebrow="DEVOLUCIÓN · SOLO CON TICKET"
          title="Escaneá el ticket del cliente"
        />
        <div className="flex flex-1 flex-col justify-center">
          <Card>
            <EmptyState
              variant="blank"
              icon={<ScanBarcode />}
              title="Acercá el QR del ticket al lector"
              description="Sirve el QR de la factura C o el del documento de una venta diferida."
            />
          </Card>
        </div>
      </main>
      <SidePanel
        footer={
          <p className="flex items-center gap-2 text-detail text-text-subtle">
            <Info aria-hidden className="size-icon-sm shrink-0" />
            Sin ticket no se puede devolver.
          </p>
        }
      >
        <Eyebrow text="SI EL LECTOR NO LEE EL QR" />
        <p className="text-title text-text-accent">Tipeá los datos impresos en el ticket</p>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <form.AppField name="pointOfSale" listeners={{ onChange: () => setRefusal(undefined) }}>
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Punto de venta"
                inputMode="numeric"
                disabled={submitting}
              />
            )}
          </form.AppField>
          <form.AppField name="number" listeners={{ onChange: () => setRefusal(undefined) }}>
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Número de comprobante"
                inputMode="numeric"
                disabled={submitting}
              />
            )}
          </form.AppField>
          <Button
            type="submit"
            variant="secondary"
            size="large"
            fullWidth
            icon={<Search />}
            dataStatus={submitting ? "loading" : "loaded"}
          >
            Buscar venta
          </Button>
        </form>
        {notice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={notice.title}
            {...(notice.description === undefined ? {} : { description: notice.description })}
          />
        )}
        <AuthorizationSection
          authorization={authorization}
          action="hacer devoluciones"
          disabled={submitting}
        />
      </SidePanel>
    </>
  );
}
