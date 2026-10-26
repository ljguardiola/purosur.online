import type {
  Authorization,
  FindDeferredSaleOutcome,
  PrintDeferredSaleInvoiceOutcome,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  Card,
  EmptyState,
  Eyebrow,
  FloatingNotification,
  InlineNotice,
  ScreenHeader,
  SidePanel,
  useRequestForm,
} from "@purosur/ui";
import { Info, Printer, ScanBarcode, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import type { DeferredSaleReading } from "../platform/core-client";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { NoSessionRail } from "../shell/no-session-rail";
import { OpenSessionRail } from "../shell/open-session-rail";
import { ReprintReceiptModal } from "../shell/reprint-receipt-modal";
import { receiptCopyPresentation } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import {
  deferredSaleFormRequestSchema,
  deferredSaleRequestFrom,
  EMPTY_DEFERRED_SALE_FORM,
  INVALID_SHORT_CODE_MESSAGE,
  scannedDeferredSaleReading,
} from "./deferred-sale-form";
import type { DeferredSaleRefusalKind, FoundDeferredSale } from "./deferred-sale-text";
import { deferredSaleRefusal } from "./deferred-sale-text";
import { originalPrintNotice } from "./original-print-text";
import { PrintDeferredInvoiceModal } from "./print-deferred-invoice-modal";

export type DeferredSaleScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  sessionOpen: boolean;
  lock: () => void;
  findDeferredSale: (reading: DeferredSaleReading) => Promise<FindDeferredSaleOutcome>;
  printDeferredSaleInvoice: (saleId: string) => Promise<PrintDeferredSaleInvoiceOutcome>;
  reprintDeferredSaleInvoice: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
};

export function DeferredSaleScreen({
  person,
  registerName,
  sessionOpen,
  lock,
  findDeferredSale,
  printDeferredSaleInvoice,
  reprintDeferredSaleInvoice,
  loadAuthorizers,
  onSessionInvalid,
}: DeferredSaleScreenProps) {
  const [refusal, setRefusal] = useState<DeferredSaleRefusalKind>();
  const [found, setFound] = useState<FoundDeferredSale>();
  const [printed, setPrinted] = useState(false);
  const lastReading = useRef<DeferredSaleReading>(undefined);
  const [printedSale, setPrintedSale] = useState<FoundDeferredSale>();
  const [reprinting, setReprinting] = useState(false);
  const [reprinted, setReprinted] = useState<ReceiptCopyShown>();
  const finding = useRef(false);

  async function look(reading: DeferredSaleReading) {
    if (finding.current) {
      return;
    }
    finding.current = true;
    lastReading.current = reading;
    setRefusal(undefined);
    setPrintedSale(undefined);
    const outcome = await findDeferredSale(reading)
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
        if (outcome.original_printed) {
          setRefusal("already_printed");
          setPrintedSale(outcome);
        } else {
          setFound(outcome);
        }
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      default:
        setRefusal(outcome.kind);
    }
  }

  const { form, submit, submitting } = useRequestForm({
    defaultValues: EMPTY_DEFERRED_SALE_FORM,
    request: { schema: deferredSaleFormRequestSchema, from: deferredSaleRequestFrom },
    fields: { reading: "code" },
    messages: { code: INVALID_SHORT_CODE_MESSAGE },
    onSubmit: ({ reading }) => look(reading),
  });

  function takeScan(text: string) {
    const reading = scannedDeferredSaleReading(text);
    if (reading === undefined) {
      setRefusal("not_a_deferred_sale_qr");
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

  const notice = refusal === undefined ? undefined : deferredSaleRefusal(refusal);

  return (
    <div className="flex h-full w-full bg-surface-subtle">
      {sessionOpen ? (
        <OpenSessionRail
          registerName={registerName}
          lock={lock}
          current="deferred_sale"
          abilities={person.abilities}
        />
      ) : (
        <NoSessionRail person={person} current="/deferred-sale" signOut={lock} />
      )}
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        <ScreenHeader
          eyebrow="VENTA DIFERIDA · EL CLIENTE VOLVIÓ POR SU FACTURA"
          title="Escaneá el documento del cliente"
        />
        <div className="flex flex-1 flex-col justify-center">
          <Card>
            <EmptyState
              variant="blank"
              icon={<ScanBarcode />}
              title="Acercá el QR del documento al lector"
              description="Sirve el QR del documento no fiscal de una venta diferida."
            />
          </Card>
        </div>
      </main>
      <SidePanel
        footer={
          <p className="text-detail text-text-subtle">
            La factura sale como original, con la fecha de la venta.
          </p>
        }
      >
        <Eyebrow text="SI EL LECTOR NO LEE EL QR" />
        <p className="text-title text-text-accent">
          Tipeá el código de consulta impreso en el documento
        </p>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <form.AppField name="code" listeners={{ onChange: () => setRefusal(undefined) }}>
            {(field) => (
              <field.TextField kind="plain-text" label="Código de consulta" disabled={submitting} />
            )}
          </form.AppField>
          <Button
            type="submit"
            size="large"
            fullWidth
            dataStatus={submitting ? "loading" : "loaded"}
          >
            Buscar venta
          </Button>
        </form>
        {notice === undefined ? null : (
          <InlineNotice
            tone={notice.tone}
            icon={notice.tone === "info" ? <Info /> : <TriangleAlert />}
            title={notice.title}
            description={notice.description}
          />
        )}
        {refusal === "already_printed" && printedSale !== undefined ? (
          <Button
            variant="secondary"
            size="large"
            fullWidth
            icon={<Printer />}
            onPress={() => setReprinting(true)}
          >
            {receiptCopyPresentation({ kind: "duplicate" }).printButton}
          </Button>
        ) : null}
      </SidePanel>
      {found === undefined ? null : (
        <PrintDeferredInvoiceModal
          sale={found}
          printInvoice={printDeferredSaleInvoice}
          onPrinted={() => {
            setFound(undefined);
            setPrinted(true);
          }}
          onRefused={(reason) => {
            setFound(undefined);
            if (reason === "already_printed" && lastReading.current !== undefined) {
              void look(lastReading.current);
            } else {
              setRefusal(reason);
            }
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setFound(undefined)}
        />
      )}
      {reprinting && printedSale !== undefined && printedSale.invoice.kind === "issued" ? (
        <ReprintReceiptModal
          document="deferred_invoice"
          sale={{
            sale_id: printedSale.sale_id,
            occurred_at: printedSale.occurred_at,
            comprobante: {
              kind: "fiscal",
              document_type: "factura_c",
              authorization: "real_time",
              point_of_sale: printedSale.invoice.point_of_sale,
              number: printedSale.invoice.number,
            },
            next_copy: { kind: "duplicate" },
          }}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprint={reprintDeferredSaleInvoice}
          onReprinted={(copy) => {
            setReprinting(false);
            setPrintedSale(undefined);
            setRefusal(undefined);
            setReprinted(copy);
          }}
          onSaleGone={() => {
            setReprinting(false);
            setPrintedSale(undefined);
            setRefusal("not_found");
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setReprinting(false)}
        />
      ) : null}
      {reprinted === undefined ? null : (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title="La reimpresión de la factura sale en cuanto la impresora esté lista"
          description={`${receiptCopyPresentation(reprinted).comesOutAs}.`}
          onDismiss={() => setReprinted(undefined)}
        />
      )}
      {printed ? (
        <FloatingNotification
          icon={<Printer />}
          {...originalPrintNotice("deferred_invoice", "started")}
          onDismiss={() => setPrinted(false)}
        />
      ) : null}
    </div>
  );
}
