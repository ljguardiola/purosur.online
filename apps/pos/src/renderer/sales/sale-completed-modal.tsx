import type {
  ReceiptCopyShown,
  ReceiptPrintStatusOutcome,
  RetryReceiptPrintOutcome,
} from "@purosur/contracts";
import { Button, FigureStat, formatCents, InlineNotice, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowRight, CircleCheck, Plus, Printer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ReceiptPrintStatus } from "./sales-queries";
import { useReceiptPrintStatusQuery, useRefreshReceiptPrintStatus } from "./sales-queries";

const RETRY_FAILED_MESSAGE = "No se pudo reintentar la impresión. Probá de nuevo.";

type FailedStanding = "cover_open" | "paper_out" | "not_responding" | "retry_offered" | "failed";

type FailurePresentation = {
  printerState: string | undefined;
  title?: string;
  help: (copy: ReceiptCopyShown) => string;
};

const AUTOMATIC_RESOLUTION =
  "El ticket ya enviado queda en la impresora y sale solo cuando se resuelve. No hace falta reimprimir.";

const UNCONFIRMED_PRINT = "La impresora volvió a responder pero no confirmó la impresión.";

function retryCopyText(copy: ReceiptCopyShown): string {
  return copy.kind === "original"
    ? "El reintento sale como original."
    : `Como el ticket ya se había enviado, el reintento sale como duplicado, con la reimpresión Nº ${copy.order_number}.`;
}

const FAILURES: Record<FailedStanding, FailurePresentation> = {
  paper_out: {
    printerState: "Sin papel",
    title: "La impresora se quedó sin papel",
    help: () => `Poné un rollo nuevo y cerrá la tapa. ${AUTOMATIC_RESOLUTION}`,
  },
  cover_open: {
    printerState: "Tapa abierta",
    title: "La tapa de la impresora está abierta",
    help: () => `Cerrala. ${AUTOMATIC_RESOLUTION}`,
  },
  not_responding: {
    printerState: "No responde",
    title: "La impresora no responde",
    help: () =>
      "Revisá que esté encendida y con el cable conectado. Si vuelve a responder y el ticket no sale, se ofrece reintentar.",
  },
  retry_offered: {
    printerState: "Normal · sin confirmar la impresión",
    title: "El ticket no salió",
    help: (copy) => `${UNCONFIRMED_PRINT} ${retryCopyText(copy)}`,
  },
  failed: {
    printerState: undefined,
    help: () => "Imprimilo desde el historial de ventas.",
  },
};

function failedStandingOf(status: ReceiptPrintStatus): FailedStanding | undefined {
  const { standing, printed } = status;
  if (printed || standing === null || standing === "printing" || standing === "printed") {
    return undefined;
  }
  return standing;
}

function receiptRowValue(receipt: ReturnType<typeof useReceiptPrintStatusQuery>): string {
  if (receipt.status === "failed") {
    return "No se pudo leer el estado";
  }
  return receipt.status === "loaded" && receipt.value.printed ? "Impreso" : "Imprimiendo";
}

export type SaleCompletedModalProps = {
  saleId: string;
  total: number;
  readReceiptStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  retryReceiptPrint: (saleId: string) => Promise<RetryReceiptPrintOutcome>;
  onNewSale: () => void;
} & (
  | { tendered: number; change: number; method?: "CASH" }
  | { method: "TRANSFER"; amount: number }
  | { method: "QR"; amount: number }
);

export function SaleCompletedModal(props: SaleCompletedModalProps) {
  const { saleId, total, readReceiptStatus, retryReceiptPrint, onNewSale } = props;
  const change = props.method === "TRANSFER" || props.method === "QR" ? 0 : props.change;
  const receipt = useReceiptPrintStatusQuery({ saleId, read: readReceiptStatus });
  const refreshReceipt = useRefreshReceiptPrintStatus(saleId);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<string>();
  const paymentRow =
    props.method === "TRANSFER"
      ? { label: "Transferencia", value: formatCents(props.amount) }
      : props.method === "QR"
        ? { label: "QR de Mercado Pago", value: formatCents(props.amount) }
        : { label: "Efectivo entregado", value: formatCents(props.tendered) };
  const failedStanding = receipt.status === "loaded" ? failedStandingOf(receipt.value) : undefined;

  async function retry() {
    if (retrying) {
      return;
    }
    setRetrying(true);
    setNotice(undefined);
    const outcome = await retryReceiptPrint(saleId).catch((): "failed" => "failed");
    setRetrying(false);
    if (outcome === "failed" || outcome.kind === "unavailable") {
      setNotice(RETRY_FAILED_MESSAGE);
      return;
    }
    if (outcome.kind === "lacks_permission") {
      setNotice("No tenés permiso para reintentar la impresión.");
      return;
    }
    await refreshReceipt();
  }

  if (receipt.status === "loaded" && failedStanding !== undefined) {
    const failure = FAILURES[failedStanding];
    const { next_copy: copy } = receipt.value;
    return (
      <Modal
        open
        onOpenChange={() => {}}
        width="standard"
        tone="error"
        icon={<Printer />}
        context="IMPRESORA"
        contextTone="error"
        title="No se pudo imprimir el ticket"
        footer={
          failedStanding === "retry_offered" ? (
            <>
              <Button variant="secondary" size="large" icon={<ArrowRight />} onPress={onNewSale}>
                Seguir vendiendo
              </Button>
              <Button
                size="large"
                fullWidth
                icon={<Printer />}
                disabled={retrying}
                onPress={() => void retry()}
              >
                Reintentar impresión
              </Button>
            </>
          ) : (
            <Button size="large" fullWidth icon={<ArrowRight />} onPress={onNewSale}>
              Seguir vendiendo
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <SummaryRowGroup
            rows={[
              { label: "Venta", value: "Confirmada · no se deshace" },
              ...(change > 0 ? [{ label: "Vuelto a entregar", value: formatCents(change) }] : []),
              ...(failure.printerState === undefined
                ? []
                : [{ label: "Impresora térmica", value: failure.printerState }]),
              { label: "Ticket", value: "Pendiente de imprimir" },
            ]}
          />
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            description={failure.help(copy)}
            {...(failure.title === undefined ? {} : { title: failure.title })}
          />
          {notice === undefined || failedStanding !== "retry_offered" ? null : (
            <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onOpenChange={() => {}}
      width="standard"
      tone="success"
      icon={<CircleCheck />}
      context="VENTA COMPLETADA"
      contextTone="success"
      title={change > 0 ? "Entregá el vuelto" : "No hay vuelto para entregar"}
      footer={
        <Button size="large" fullWidth icon={<Plus />} onPress={onNewSale}>
          Nueva venta
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {change > 0 ? <FigureStat label="VUELTO" value={formatCents(change)} /> : null}
        <SummaryRowGroup
          rows={[
            { label: "Total", value: formatCents(total) },
            paymentRow,
            { label: "Ticket", value: receiptRowValue(receipt) },
          ]}
        />
      </div>
    </Modal>
  );
}
