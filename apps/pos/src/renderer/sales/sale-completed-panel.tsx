import type {
  AnswerReceiptQuestionOutcome,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
} from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
import {
  Button,
  DocumentList,
  Eyebrow,
  FigureStat,
  formatCents,
  InlineNotice,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
  Tag,
  TimedOfferCard,
} from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus, Printer, Receipt, TriangleAlert, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { pointCardName } from "../platform/payment-method-names";
import { backupPrinterState } from "../shell/contingency-backup-printer-failure-text";
import type { ReceiptPrintStatus } from "./sales-queries";
import {
  useAnswerReceiptQuestionMutation,
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
  if (
    printed ||
    standing === null ||
    standing === "printing" ||
    standing === "printed" ||
    standing === "preparing" ||
    standing === "awaiting_answer" ||
    standing === "declined"
  ) {
    return undefined;
  }
  return standing;
}

function receiptRowValue(receipt: ReturnType<typeof useReceiptPrintStatusQuery>): string {
  if (receipt.status === "failed") {
    return "No se pudo leer el estado";
  }
  if (receipt.status === "loaded" && !receipt.value.printed) {
    if (receipt.value.standing === "declined") {
      return "No impreso";
    }
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
        <Tag tone="neutral">Por imprimir</Tag>
      ) : (
        <Tag tone="warning">{failure}</Tag>
      );
    }
    case "awaiting_customer_document":
      return <Tag tone="neutral">Por imprimir</Tag>;
  }
}

type SurplusRefund = { amount: number; sentByCloud: boolean };

const SURPLUS_SENT_BY_CLOUD =
  "La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.";

const SURPLUS_MADE_BY_HAND =
  "Lo devuelve una persona desde Mercado Pago, cuando lo atiende en el backoffice.";

export type SaleCompletedPanelProps = {
  saleId: string;
  total: number;
  readReceiptStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  answerReceiptQuestion: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
  readBackupTicket: (saleId: string) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  readBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  mayChangePrinter: boolean;
  onNewSale: () => void;
} & (
  | { tendered: number; change: number; cashRounding: number; method?: "CASH" }
  | { method: "TRANSFER"; amount: number }
  | { method: "QR"; amount: number; surplusRefund?: SurplusRefund }
  | {
      method: "POINT";
      cardType: PointCardType | null;
      amount: number;
      surplusRefund?: SurplusRefund;
    }
  | { method: "STANDALONE_TERMINAL"; amount: number }
);

type ReceiptOffer = NonNullable<ReceiptPrintStatus["offer"]>;

function PrintOffer({
  offer,
  disabled,
  onPrint,
  onSkip,
}: {
  offer: ReceiptOffer;
  disabled: boolean;
  onPrint: () => void;
  onSkip: () => void;
}) {
  return (
    <TimedOfferCard
      icon={<Printer />}
      title="¿Imprimir ticket?"
      skip={{ label: "Omitir", onPress: onSkip }}
      countdown={{
        remainingSeconds: Math.ceil(offer.remaining_ms / 1000),
        totalSeconds: Math.ceil(offer.length_ms / 1000),
        label: "Tiempo para imprimir",
      }}
      accept={{ label: "Sí", icon: <Check />, onPress: onPrint, disabled }}
    />
  );
}

export function SaleCompletedPanel(props: SaleCompletedPanelProps) {
  const {
    saleId,
    total,
    readReceiptStatus,
    answerReceiptQuestion,
    readBackupTicket,
    readBackupTickets,
    mayChangePrinter,
    onNewSale,
  } = props;
  const navigate = useNavigate();
  const change = "change" in props ? props.change : 0;
  const cashRounding = "cashRounding" in props ? props.cashRounding : 0;
  const surplusRefund = "surplusRefund" in props ? props.surplusRefund : undefined;
  const receipt = useReceiptPrintStatusQuery({ saleId, read: readReceiptStatus });
  const answer = useAnswerReceiptQuestionMutation({ saleId, answer: answerReceiptQuestion });
  const asking = receipt.status === "loaded" && receipt.value.standing === "awaiting_answer";
  const offer = asking ? receipt.value.offer : null;
  const [offered, setOffered] = useState(false);
  if (asking && !offered) {
    setOffered(true);
  }
  const [offerLengthMs, setOfferLengthMs] = useState<number | null>(null);
  if (offer !== null && offer.length_ms !== offerLengthMs) {
    setOfferLengthMs(offer.length_ms);
  }
  const mayStartNewSale =
    receipt.status === "failed" ||
    (receipt.status === "loaded" && receipt.value.standing !== "preparing");
  const answerSent =
    answer.isPending ||
    (answer.data !== undefined &&
      (answer.data.kind === "printing" ||
        answer.data.kind === "declined" ||
        answer.data.kind === "lapsed" ||
        answer.data.kind === "not_awaiting"));
  const answerFailed = answer.isError || (answer.data !== undefined && !answerSent);
  const mayAnswer = asking && !answerSent;
  const lapsed =
    answer.data?.kind === "lapsed" ||
    (offered &&
      !answerSent &&
      receipt.status === "loaded" &&
      receipt.value.standing === "declined");
  const shownOffer =
    offer ??
    (lapsed && offerLengthMs !== null ? { remaining_ms: 0, length_ms: offerLengthMs } : null);
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
            : { label: "Efectivo", value: formatCents(props.tendered) };
  const failedStanding = receipt.status === "loaded" ? failedStandingOf(receipt.value) : undefined;
  const mayChangeFailedPrinter = mayChangePrinter && failedStanding !== undefined;

  useEffect(() => {
    if (lapsed) {
      onNewSale();
    }
  }, [lapsed, onNewSale]);

  function print() {
    if (mayAnswer) {
      answer.mutate(true);
    }
  }

  function skip() {
    if (mayAnswer) {
      answer.mutate(false);
      onNewSale();
    }
  }

  function changePrinter() {
    void navigate({ to: "/receipt-printer" });
  }

  useKeys([
    { key: "Escape", run: skip },
    { key: "F2", run: changePrinter, enabled: mayChangeFailedPrinter },
  ]);
  useKeys(
    [
      {
        key: "Enter",
        run: asking ? print : onNewSale,
        enabled: asking ? mayAnswer : mayStartNewSale,
      },
    ],
    { fallback: true },
  );

  const header = <SidePanelTitle icon={<Check />} title="Venta completada" />;
  const changeFigure =
    change > 0 ? <FigureStat size="hero" label="VUELTO" value={formatCents(change)} /> : null;

  if (receipt.status === "loaded" && failedStanding !== undefined) {
    const failure = FAILURES[failedStanding];
    return (
      <SidePanel
        label="Venta completada"
        header={header}
        footer={
          <Button
            size="large"
            fullWidth
            icon={<Plus />}
            iconPosition="start"
            keycap="Enter"
            onPress={onNewSale}
          >
            Seguir vendiendo
          </Button>
        }
      >
        {changeFigure}
        <SummaryRowGroup
          variant="plain"
          rows={[
            { label: "Venta", value: "Confirmada · no se deshace" },
            ...(failure.printerState === undefined
              ? []
              : [{ label: "Impresora térmica", value: failure.printerState }]),
            { label: "Ticket", value: "Pendiente de imprimir" },
          ]}
        />
        <InlineNotice
          tone="error"
          icon={<Printer />}
          description={failure.help}
          {...(failure.title === undefined ? {} : { title: failure.title })}
        />
        {mayChangePrinter ? (
          <div className="flex">
            <Button variant="text" keycap="F2" onPress={changePrinter}>
              Cambiar impresora
            </Button>
          </div>
        ) : null}
      </SidePanel>
    );
  }

  const contingency =
    receipt.status === "loaded" &&
    receipt.value.comprobante.kind === "fiscal" &&
    receipt.value.comprobante.authorization === "offline_code";
  const deferred =
    receipt.status === "loaded" && receipt.value.comprobante.kind === "deferred_non_fiscal";
  const printState = receiptRowValue(receipt);
  const printed = receipt.status === "loaded" && receipt.value.printed;
  const customerDocument = contingency
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
          status: (
            <Tag tone={printed ? "success" : printState === "No impreso" ? "neutral" : "info"}>
              {printState}
            </Tag>
          ),
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
    <SidePanel
      label="Venta completada"
      header={header}
      footer={
        shownOffer === null ? (
          <Button
            size="large"
            fullWidth
            icon={<Plus />}
            iconPosition="start"
            keycap="Enter"
            disabled={!mayStartNewSale}
            onPress={onNewSale}
          >
            Nueva venta
          </Button>
        ) : (
          <PrintOffer
            offer={shownOffer}
            disabled={answerSent || offer === null}
            onPrint={print}
            onSkip={skip}
          />
        )
      }
    >
      {changeFigure}
      {contingency || deferred ? null : (
        <SummaryRowGroup
          variant="plain"
          rows={[
            { label: "Total", value: formatCents(total) },
            ...(cashRounding === 0
              ? []
              : [{ label: "Redondeo", value: `– ${formatCents(cashRounding)}` }]),
            paymentRow,
            ...(asking ? [] : [{ label: "Ticket", value: printState }]),
          ]}
        />
      )}
      {surplusRefund !== undefined && surplusRefund.amount > 0 ? (
        <InlineNotice
          tone="info"
          icon={<Undo2 />}
          title={`Reembolso pendiente de ${formatCents(surplusRefund.amount)} por Mercado Pago`}
          description={surplusRefund.sentByCloud ? SURPLUS_SENT_BY_CLOUD : SURPLUS_MADE_BY_HAND}
        />
      ) : null}
      {firstDocument === undefined ? null : (
        <div className="flex flex-col gap-2">
          <Eyebrow text="DOCUMENTOS" />
          <DocumentList label="Documentos" rows={[firstDocument, ...otherDocuments]} />
        </div>
      )}
      {answerFailed ? (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title="No se pudo enviar la respuesta. Probá de nuevo."
        />
      ) : null}
      {keepNotice === undefined ? null : (
        <InlineNotice
          tone="warning"
          icon={<Receipt />}
          title={keepNotice.title}
          description={keepNotice.description}
        />
      )}
    </SidePanel>
  );
}
