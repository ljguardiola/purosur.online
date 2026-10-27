import type {
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
} from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
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
import { pointCardName } from "../platform/payment-method-names";
import { backupPrinterState } from "../shell/contingency-backup-printer-failure-text";
import type { ReceiptPrintStatus } from "./sales-queries";
import {
  useBackupPrinterFailureQuery,
  useBackupTicketOfSaleQuery,
  useReceiptPrintStatusQuery,
} from "./sales-queries";

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

type BackupStanding = NonNullable<
  Extract<ReadContingencyBackupTicketOfSaleOutcome, { kind: "read" }>["ticket"]["standing"]
>;

type PrinterFailure = Extract<
  ReadContingencyBackupTicketsOutcome,
  { kind: "read" }
>["tickets"]["printer"];

function backupTicketStatus(standing: BackupStanding, printerFailure: PrinterFailure) {
  switch (standing) {
    case "kept":
    case "discardable":
    case "discarded":
      return <Tag tone="success">Impreso</Tag>;
    case "no_longer_needed":
      return <Tag tone="neutral">No hace falta</Tag>;
    case "missing_key":
      return <Tag tone="warning">Sin clave de respaldo</Tag>;
    case "to_print": {
      const failure = printerFailure === null ? undefined : backupPrinterState(printerFailure);
      return failure === undefined ? (
        <Tag tone="info">Imprimiendo</Tag>
      ) : (
        <Tag tone="warning">{failure}</Tag>
      );
    }
    case "awaiting_customer_document":
      return <Tag tone="info">Imprimiendo</Tag>;
  }
}

export type SaleCompletedModalProps = {
  saleId: string;
  total: number;
  readReceiptStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  readBackupTicket: (saleId: string) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  readBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  mayChangePrinter: boolean;
  onNewSale: () => void;
} & (
  | { tendered: number; change: number; method?: "CASH" }
  | { method: "TRANSFER"; amount: number }
  | { method: "QR"; amount: number }
  | { method: "POINT"; cardType: PointCardType | null; amount: number }
  | { method: "STANDALONE_TERMINAL"; amount: number }
);

export function SaleCompletedModal(props: SaleCompletedModalProps) {
  const {
    saleId,
    total,
    readReceiptStatus,
    readBackupTicket,
    readBackupTickets,
    mayChangePrinter,
    onNewSale,
  } = props;
  const navigate = useNavigate();
  const change = "change" in props ? props.change : 0;
  const receipt = useReceiptPrintStatusQuery({ saleId, read: readReceiptStatus });
  const backupTicket = useBackupTicketOfSaleQuery({ saleId, read: readBackupTicket });
  const backupStanding = backupTicket.status === "loaded" ? backupTicket.value.standing : null;
  const backupPrinterFailure = useBackupPrinterFailureQuery({
    read: readBackupTickets,
    enabled: backupStanding === "to_print",
  });
  const paymentRow =
    props.method === "TRANSFER"
      ? { label: "Transferencia", value: formatCents(props.amount) }
      : props.method === "QR"
        ? { label: "QR de Mercado Pago", value: formatCents(props.amount) }
        : props.method === "POINT"
          ? { label: pointCardName(props.cardType), value: formatCents(props.amount) }
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
  const deferred =
    receipt.status === "loaded" && receipt.value.comprobante.kind === "deferred_non_fiscal";
  const printState = receiptRowValue(receipt);
  const printed = receipt.status === "loaded" && receipt.value.printed;
  const customerDocument =
    contingency !== undefined
      ? { title: "Factura C", detail: "Para el cliente" }
      : deferred
        ? {
            title: "Documento no válido como factura",
            detail: "Para el cliente · con la indicación de volver por la factura",
          }
        : undefined;
  const documentRows = [
    customerDocument === undefined
      ? undefined
      : {
          ...customerDocument,
          status: <Tag tone={printed ? "success" : "info"}>{printState}</Tag>,
        },
    backupStanding === null
      ? undefined
      : {
          title: "Ticket de respaldo de contingencia",
          detail: "Queda en el local",
          status: backupTicketStatus(
            backupStanding,
            backupPrinterFailure.status === "loaded" ? backupPrinterFailure.value : null,
          ),
        },
  ].filter((row) => row !== undefined);
  const [firstDocument, ...otherDocuments] = documentRows;
  const keepNotice =
    backupStanding === "kept" ||
    backupStanding === "to_print" ||
    backupStanding === "awaiting_customer_document"
      ? deferred
        ? {
            title: "Pedile al cliente que vuelva por su factura",
            description:
              "Guardá el ticket de respaldo en la caja del local hasta que esta caja vuelva a sincronizar.",
          }
        : {
            title: "Guardá el ticket de respaldo en la caja del local",
            description: "Queda ahí hasta que esta caja vuelva a sincronizar con la nube.",
          }
      : undefined;

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
            contingency !== undefined
              ? {
                  label: "Modo fiscal",
                  value: <Tag tone="warning">Contingencia con CAEA</Tag>,
                }
              : deferred
                ? {
                    label: "Modo fiscal",
                    value: <Tag tone="warning">Venta diferida · sin factura en el momento</Tag>,
                  }
                : { label: "Ticket", value: printState },
          ]}
        />
        {firstDocument === undefined ? null : (
          <DocumentList label="Documentos" rows={[firstDocument, ...otherDocuments]} />
        )}
        {keepNotice === undefined ? null : (
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            title={keepNotice.title}
            description={keepNotice.description}
          />
        )}
      </div>
    </Modal>
  );
}
