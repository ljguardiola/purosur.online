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
  FigureStat,
  FloatingNotification,
  formatCents,
  formatDayMonthAndTime,
  formatNumber,
  InlineNotice,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Info, Printer, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DeferredSaleReading } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import { useBarcodeReadings } from "../shell/barcode-readings";
import { NoSessionRail } from "../shell/no-session-rail";
import { OpenSessionRail } from "../shell/open-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import { ReprintReceiptModal } from "../shell/reprint-receipt-modal";
import { receiptCopyPresentation } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import { scannedDeferredSaleReading } from "./deferred-sale-form";
import { DeferredSaleLines } from "./deferred-sale-lines";
import type { DeferredSaleRefusalKind, FoundDeferredSale } from "./deferred-sale-text";
import {
  deferredInvoiceNotYetDescription,
  deferredSaleComprobanteLine,
  deferredSaleRefusal,
} from "./deferred-sale-text";
import { originalPrintNotice } from "./original-print-text";

type PrintNotice = ReturnType<typeof originalPrintNotice>;

function pendingLabel(invoice: FoundDeferredSale["invoice"]): string {
  return invoice.kind === "pending" ? "Emitiendo la factura…" : "Imprimiendo la factura…";
}

export type DeferredSaleScreenProps = {
  person: SignedInPerson;
  reading: string | undefined;
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
  reading,
  sessionOpen,
  lock,
  findDeferredSale,
  printDeferredSaleInvoice,
  reprintDeferredSaleInvoice,
  loadAuthorizers,
  onSessionInvalid,
}: DeferredSaleScreenProps) {
  const navigate = useNavigate();
  const [refusal, setRefusal] = useState<DeferredSaleRefusalKind>();
  const [sale, setSale] = useState<FoundDeferredSale>();
  const [printing, setPrinting] = useState(false);
  const [printNotice, setPrintNotice] = useState<PrintNotice>();
  const printingNow = useRef(false);
  const [printed, setPrinted] = useState(false);
  const lastReading = useRef<DeferredSaleReading>(undefined);
  const [reprinting, setReprinting] = useState(false);
  const [reprinted, setReprinted] = useState<ReceiptCopyShown>();
  const finding = useRef(false);

  async function look(next: DeferredSaleReading) {
    if (finding.current) {
      return;
    }
    finding.current = true;
    lastReading.current = next;
    setRefusal(undefined);
    setPrintNotice(undefined);
    setSale(undefined);
    const outcome = await findDeferredSale(next)
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
        setSale(outcome);
        if (outcome.original_printed) {
          setRefusal("already_printed");
        }
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      default:
        setRefusal(outcome.kind);
    }
  }

  function takeScan(text: string) {
    const scanned = scannedDeferredSaleReading(text);
    if (scanned === undefined) {
      setRefusal("not_a_deferred_sale_qr");
    } else {
      void look(scanned);
    }
  }
  useBarcodeReadings(takeScan);

  const latestTakeScan = useRef(takeScan);
  useEffect(() => {
    latestTakeScan.current = takeScan;
  });
  useEffect(() => {
    if (reading !== undefined) {
      latestTakeScan.current(reading);
    }
  }, [reading]);

  async function print(saleToPrint: FoundDeferredSale) {
    if (printingNow.current) {
      return;
    }
    printingNow.current = true;
    setPrinting(true);
    setPrintNotice(undefined);
    const outcome = await printDeferredSaleInvoice(saleToPrint.sale_id).catch(
      (): "failed" => "failed",
    );
    printingNow.current = false;
    setPrinting(false);
    if (outcome === "failed") {
      setPrintNotice(originalPrintNotice("deferred_invoice", "unavailable"));
      return;
    }
    switch (outcome.kind) {
      case "started":
        setSale(undefined);
        setPrinted(true);
        break;
      case "already_printed":
        if (lastReading.current !== undefined) {
          void look(lastReading.current);
        }
        break;
      case "voided":
      case "expired":
      case "out_of_date_order":
      case "not_found":
        setSale(undefined);
        setRefusal(outcome.kind);
        break;
      case "sale_voided":
        setSale(undefined);
        setRefusal("voided");
        break;
      case "not_yet":
        setPrintNotice({
          tone: "warning",
          title: "Todavía no se puede facturar",
          description: deferredInvoiceNotYetDescription(outcome.cause),
        });
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "busy":
      case "printer_not_configured":
      case "lacks_permission":
      case "unavailable":
        setPrintNotice(originalPrintNotice("deferred_invoice", outcome.kind));
        break;
    }
  }

  function goBack() {
    void navigate({ to: sessionOpen ? "/session" : "/" });
  }

  const printable = sale !== undefined && !sale.original_printed;
  const reprintable = sale?.original_printed === true && sale.invoice.kind === "issued";
  useKeys(
    [
      {
        key: "Enter",
        run: () => (printable ? void print(sale) : setReprinting(true)),
        enabled: printable || reprintable,
      },
    ],
    { active: !reprinting },
  );

  const shownNotice =
    printNotice ?? (refusal === undefined ? undefined : deferredSaleRefusal(refusal));

  return (
    <RegisterFrame
      background="subtle"
      rail={
        sessionOpen ? (
          <OpenSessionRail lock={lock} current="sale" abilities={person.abilities} />
        ) : (
          <NoSessionRail person={person} signOut={lock} />
        )
      }
      aside={
        <SidePanel
          label="Venta diferida"
          width="wide"
          header={<SidePanelTitle title="Venta diferida" icon={<FileText />} onClose={goBack} />}
          footer={
            printable ? (
              <Button
                size="large"
                fullWidth
                icon={<Printer />}
                iconPosition="start"
                keycap="Enter"
                disabled={printing}
                dataStatus={printing ? "loading" : "loaded"}
                onPress={() => void print(sale)}
              >
                {printing ? pendingLabel(sale.invoice) : "Imprimir factura"}
              </Button>
            ) : reprintable ? (
              <Button
                variant="secondary"
                size="large"
                fullWidth
                icon={<Printer />}
                keycap="Enter"
                onPress={() => setReprinting(true)}
              >
                {receiptCopyPresentation({ kind: "duplicate" }).printButton}
              </Button>
            ) : undefined
          }
        >
          {sale === undefined ? null : (
            <>
              <FigureStat
                size="hero"
                variant="plain"
                label="TOTAL"
                value={formatCents(sale.total)}
              />
              <SummaryRowGroup
                rows={[
                  { label: "Venta del", value: formatDayMonthAndTime(sale.occurred_at) },
                  { label: "Comprobante", value: deferredSaleComprobanteLine(sale.invoice) },
                  { label: "Artículos", value: formatNumber(sale.item_count) },
                ]}
              />
            </>
          )}
          {shownNotice === undefined ? null : (
            <InlineNotice
              tone={shownNotice.tone}
              icon={shownNotice.tone === "info" ? <Info /> : <TriangleAlert />}
              title={shownNotice.title}
              description={shownNotice.description}
            />
          )}
        </SidePanel>
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <DeferredSaleLines lines={sale === undefined ? [] : sale.lines} />
      </main>
      {reprinting && sale !== undefined && sale.invoice.kind === "issued" ? (
        <ReprintReceiptModal
          document="deferred_invoice"
          sale={{
            sale_id: sale.sale_id,
            occurred_at: sale.occurred_at,
            comprobante: {
              kind: "fiscal",
              document_type: "factura_c",
              authorization: "real_time",
              point_of_sale: sale.invoice.point_of_sale,
              number: sale.invoice.number,
            },
            next_copy: { kind: "duplicate" },
          }}
          person={person}
          loadAuthorizers={loadAuthorizers}
          reprint={reprintDeferredSaleInvoice}
          onReprinted={(copy) => {
            setReprinting(false);
            setSale(undefined);
            setRefusal(undefined);
            setReprinted(copy);
          }}
          onSaleGone={() => {
            setReprinting(false);
            setSale(undefined);
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
    </RegisterFrame>
  );
}
