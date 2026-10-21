import type { ReceiptPrintStatusOutcome } from "@purosur/contracts";
import {
  Button,
  DocumentList,
  FigureStat,
  formatCents,
  InlineNotice,
  Modal,
  SummaryRowGroup,
  Tag,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, Plus, Printer, TriangleAlert } from "lucide-react";
import type { ReceiptPrintStatus } from "./sales-queries";
import { useReceiptPrintStatusQuery } from "./sales-queries";

type FailedStanding =
  | "cover_open"
  | "paper_out"
  | "not_responding"
  | "printer_not_configured"
  | "failed";

type FailurePresentation = {
  printerState: string | undefined;
  title?: string;
  help: string;
};

const PRINT_FROM_HISTORY = "Imprimilo desde el historial de ventas.";

const FAILURES: Record<FailedStanding, FailurePresentation> = {
  paper_out: {
    printerState: "Sin papel",
    title: "La impresora se quedó sin papel",
    help: "Poné un rollo nuevo y cerrá la tapa. El ticket sale solo cuando la impresora tenga papel.",
  },
  cover_open: {
    printerState: "Tapa abierta",
    title: "La tapa de la impresora está abierta",
    help: "Cerrala. El ticket sale solo cuando se cierre.",
  },
  not_responding: {
    printerState: "No responde",
    title: "La impresora no responde",
    help: "Revisá que esté encendida y con el cable conectado. El ticket sale solo cuando vuelva a responder.",
  },
  printer_not_configured: {
    printerState: "Sin configurar",
    title: "La impresora no está configurada",
    help: "Cargá su dirección en Impresora y después imprimí el ticket desde el historial de ventas.",
  },
  failed: {
    printerState: undefined,
    help: PRINT_FROM_HISTORY,
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
  mayChangePrinter: boolean;
  onNewSale: () => void;
} & (
  | { tendered: number; change: number; method?: "CASH" }
  | { method: "TRANSFER"; amount: number }
  | { method: "QR"; amount: number }
  | { method: "POINT"; amount: number }
  | { method: "STANDALONE_TERMINAL"; amount: number }
);

export function SaleCompletedModal(props: SaleCompletedModalProps) {
  const { saleId, total, readReceiptStatus, mayChangePrinter, onNewSale } = props;
  const navigate = useNavigate();
  const change = "change" in props ? props.change : 0;
  const receipt = useReceiptPrintStatusQuery({ saleId, read: readReceiptStatus });
  const paymentRow =
    props.method === "TRANSFER"
      ? { label: "Transferencia", value: formatCents(props.amount) }
      : props.method === "QR"
        ? { label: "QR de Mercado Pago", value: formatCents(props.amount) }
        : props.method === "POINT"
          ? { label: "Point integrada", value: formatCents(props.amount) }
          : props.method === "STANDALONE_TERMINAL"
            ? { label: "Terminal independiente", value: formatCents(props.amount) }
            : { label: "Efectivo entregado", value: formatCents(props.tendered) };
  const failedStanding = receipt.status === "loaded" ? failedStandingOf(receipt.value) : undefined;

  if (receipt.status === "loaded" && failedStanding !== undefined) {
    const changePrinter = mayChangePrinter ? (
      <Button
        variant="secondary"
        size="large"
        icon={<Printer />}
        onPress={() => void navigate({ to: "/receipt-printer" })}
      >
        Cambiar impresora
      </Button>
    ) : null;
    const failure = FAILURES[failedStanding];
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
          <>
            {changePrinter}
            <Button size="large" fullWidth icon={<ArrowRight />} onPress={onNewSale}>
              Seguir vendiendo
            </Button>
          </>
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
            description={failure.help}
            {...(failure.title === undefined ? {} : { title: failure.title })}
          />
        </div>
      </Modal>
    );
  }

  const contingency =
    receipt.status === "loaded" &&
    receipt.value.comprobante.kind === "fiscal" &&
    receipt.value.comprobante.authorization === "offline_code"
      ? receipt.value
      : undefined;
  const printState = receiptRowValue(receipt);

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
            contingency === undefined
              ? { label: "Ticket", value: printState }
              : {
                  label: "Modo fiscal",
                  value: <Tag tone="warning">Contingencia con CAEA</Tag>,
                },
          ]}
        />
        {contingency === undefined ? null : (
          <DocumentList
            label="Documentos para el cliente"
            rows={[
              {
                title: "Factura C",
                detail: "Para el cliente",
                status: <Tag tone={contingency.printed ? "success" : "info"}>{printState}</Tag>,
              },
            ]}
          />
        )}
      </div>
    </Modal>
  );
}
