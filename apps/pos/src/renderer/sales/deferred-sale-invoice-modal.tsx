import type { PrintDeferredSaleInvoiceOutcome } from "@purosur/contracts";
import {
  Button,
  FigureStat,
  formatCents,
  formatDayAndTime,
  HighlightedNotice,
  InlineNotice,
  Modal,
} from "@purosur/ui";
import { ArrowLeft, FileText, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { DeferredSaleRefusalKind, FoundDeferredSale } from "./deferred-sale-text";
import { deferredSaleInvoiceNumber } from "./deferred-sale-text";
import { originalPrintNotice } from "./original-print-text";

type Notice =
  | { kind: "not_yet"; cause: "cannot_authorize" | "older_sale_blocking" }
  | { kind: "printing"; notice: ReturnType<typeof originalPrintNotice> };

const NOT_YET_DESCRIPTIONS = {
  cannot_authorize:
    "La caja no puede pedir facturas a ARCA ahora. No se imprimió nada; pedile al cliente que vuelva más tarde.",
  older_sale_blocking:
    "Una venta anterior está frenando la facturación. No se imprimió nada; pedile al cliente que vuelva más tarde.",
} as const;

export type DeferredSaleInvoiceModalProps = {
  sale: Pick<FoundDeferredSale, "sale_id" | "occurred_at" | "total" | "invoice">;
  printInvoice: (saleId: string) => Promise<PrintDeferredSaleInvoiceOutcome>;
  onPrinted: () => void;
  onRefused: (
    refusal: Extract<
      DeferredSaleRefusalKind,
      "already_printed" | "voided" | "expired" | "not_found"
    >,
  ) => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function DeferredSaleInvoiceModal({
  sale,
  printInvoice,
  onPrinted,
  onRefused,
  onSessionInvalid,
  onClose,
}: DeferredSaleInvoiceModalProps) {
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  async function print() {
    if (printing) {
      return;
    }
    setPrinting(true);
    setNotice(undefined);
    const outcome = await printInvoice(sale.sale_id).catch((): "failed" => "failed");
    setPrinting(false);
    if (outcome === "failed") {
      setNotice({
        kind: "printing",
        notice: originalPrintNotice("deferred_invoice", "unavailable"),
      });
      return;
    }
    switch (outcome.kind) {
      case "started":
        onPrinted();
        break;
      case "already_printed":
      case "voided":
      case "expired":
      case "not_found":
        onRefused(outcome.kind);
        break;
      case "sale_voided":
        onRefused("voided");
        break;
      case "not_yet":
        setNotice({ kind: "not_yet", cause: outcome.cause });
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      case "busy":
      case "printer_not_configured":
      case "lacks_permission":
      case "unavailable":
        setNotice({
          kind: "printing",
          notice: originalPrintNotice("deferred_invoice", outcome.kind),
        });
        break;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !printing) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<FileText />}
      context="EL CLIENTE VOLVIÓ POR SU FACTURA"
      title="Imprimí la factura"
      closable={!printing}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={printing}
            onPress={onClose}
          >
            Volver
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Printer />}
            disabled={printing}
            dataStatus={printing ? "loading" : "loaded"}
            onPress={() => void print()}
          >
            {printing ? "Emitiendo la factura…" : "Imprimir la factura"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-4 gap-4">
          <FigureStat size="heading" label="Total" value={formatCents(sale.total)} />
          <FigureStat size="heading" label="Comprobante" value="Factura C" />
          <FigureStat
            size="heading"
            label="Número"
            value={deferredSaleInvoiceNumber(sale.invoice)}
          />
          <FigureStat size="heading" label="Venta del" value={formatDayAndTime(sale.occurred_at)} />
        </div>
        <p className="text-body text-text">
          Sale como original, con la fecha de la venta. El papel que tiene el cliente ya no hace
          falta.
        </p>
        {notice?.kind === "not_yet" ? (
          <HighlightedNotice
            tone="warning"
            icon={<TriangleAlert />}
            title="Todavía no se puede facturar"
            description={NOT_YET_DESCRIPTIONS[notice.cause]}
          />
        ) : null}
        {notice?.kind === "printing" ? (
          <InlineNotice icon={<TriangleAlert />} {...notice.notice} />
        ) : null}
      </div>
    </Modal>
  );
}
