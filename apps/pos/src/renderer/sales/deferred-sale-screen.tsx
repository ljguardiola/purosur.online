import type { FindDeferredSaleOutcome, PrintDeferredSaleInvoiceOutcome } from "@purosur/contracts";
import {
  Button,
  Card,
  EmptyState,
  Eyebrow,
  FloatingNotification,
  InlineNotice,
  ScreenHeader,
  SidePanel,
  Tag,
  useRequestForm,
} from "@purosur/ui";
import { Info, Printer, ScanBarcode, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import type { DeferredSaleReading } from "../platform/core-client";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { NoSessionRail } from "../shell/no-session-rail";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import {
  deferredSaleFormRequestSchema,
  deferredSaleRequestFrom,
  EMPTY_DEFERRED_SALE_FORM,
  INVALID_SHORT_CODE_MESSAGE,
  scannedDeferredSaleReading,
} from "./deferred-sale-form";
import { DeferredSaleInvoiceModal } from "./deferred-sale-invoice-modal";
import type { DeferredSaleRefusalKind, FoundDeferredSale } from "./deferred-sale-text";
import { deferredSaleRefusal } from "./deferred-sale-text";

export type DeferredSaleScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  sessionOpen: boolean;
  lock: () => void;
  findDeferredSale: (reading: DeferredSaleReading) => Promise<FindDeferredSaleOutcome>;
  printDeferredSaleInvoice: (saleId: string) => Promise<PrintDeferredSaleInvoiceOutcome>;
  onSessionInvalid: () => void;
};

export function DeferredSaleScreen({
  person,
  registerName,
  sessionOpen,
  lock,
  findDeferredSale,
  printDeferredSaleInvoice,
  onSessionInvalid,
}: DeferredSaleScreenProps) {
  const [refusal, setRefusal] = useState<DeferredSaleRefusalKind>();
  const [found, setFound] = useState<FoundDeferredSale>();
  const [printed, setPrinted] = useState(false);
  const finding = useRef(false);

  async function look(reading: DeferredSaleReading) {
    if (finding.current) {
      return;
    }
    finding.current = true;
    setRefusal(undefined);
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
            <div className="flex justify-center">
              <Tag variant="status" tone="success">
                Lector listo
              </Tag>
            </div>
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
      </SidePanel>
      {found === undefined ? null : (
        <DeferredSaleInvoiceModal
          sale={found}
          printInvoice={printDeferredSaleInvoice}
          onPrinted={() => {
            setFound(undefined);
            setPrinted(true);
          }}
          onRefused={(reason) => {
            setFound(undefined);
            setRefusal(reason);
          }}
          onSessionInvalid={onSessionInvalid}
          onClose={() => setFound(undefined)}
        />
      )}
      {printed ? (
        <FloatingNotification
          tone="success"
          icon={<Printer />}
          title="La factura salió como original"
          description="Entregásela al cliente."
          onDismiss={() => setPrinted(false)}
        />
      ) : null}
    </div>
  );
}
