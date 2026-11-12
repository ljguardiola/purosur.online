import type {
  AnswerReceiptQuestionOutcome,
  ChargeSaleWithPaidOrderOutcome,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
} from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
import type { CompletedCharge } from "./cash-charge-panel";
import type { CompletedPointPayment } from "./point-payment-wait-modal";
import type { CompletedQrPayment } from "./qr-payment-wait-panel";
import { SaleCompletedPanel } from "./sale-completed-panel";
import type { CompletedStandaloneTerminal } from "./standalone-terminal-charge-panel";
import type { CompletedTransfer } from "./transfer-charge-panel";

export type CompletedPaidOrder = Extract<ChargeSaleWithPaidOrderOutcome, { kind: "completed" }>;

export type CompletedPayment =
  | { method: "CASH"; charge: CompletedCharge }
  | { method: "TRANSFER"; charge: CompletedTransfer }
  | { method: "STANDALONE_TERMINAL"; charge: CompletedStandaloneTerminal }
  | { method: "QR"; charge: CompletedQrPayment }
  | { method: "POINT"; cardType: PointCardType | null; charge: CompletedPointPayment }
  | { method: "PAID_ORDER"; orderMethod: "QR" | "POINT"; charge: CompletedPaidOrder };

export function ChargeCompletedPanel({
  saleId,
  payment,
  readReceiptStatus,
  answerReceiptQuestion,
  readBackupTicket,
  readBackupTickets,
  mayChangePrinter,
  onNewSale,
}: {
  saleId: string;
  payment: CompletedPayment;
  readReceiptStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  answerReceiptQuestion: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
  readBackupTicket: (saleId: string) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  readBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  mayChangePrinter: boolean;
  onNewSale: () => void;
}) {
  const shared = {
    saleId,
    readReceiptStatus,
    answerReceiptQuestion,
    readBackupTicket,
    readBackupTickets,
    mayChangePrinter,
    onNewSale,
  };
  switch (payment.method) {
    case "CASH":
      return (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          tendered={payment.charge.tendered}
          change={payment.charge.change}
          cashRounding={payment.charge.cash_rounding}
        />
      );
    case "TRANSFER":
      return (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          method="TRANSFER"
          amount={payment.charge.amount}
        />
      );
    case "STANDALONE_TERMINAL":
      return (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          method="STANDALONE_TERMINAL"
          amount={payment.charge.amount}
        />
      );
    case "QR":
      return (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          method="QR"
          amount={payment.charge.amount}
        />
      );
    case "POINT":
      return (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          method="POINT"
          cardType={payment.cardType}
          amount={payment.charge.amount}
        />
      );
    case "PAID_ORDER":
      return payment.orderMethod === "QR" ? (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          method="QR"
          amount={payment.charge.applied}
          surplusRefund={{
            amount: payment.charge.surplus,
            sentByCloud: payment.charge.surplus_sent_by_cloud,
          }}
        />
      ) : (
        <SaleCompletedPanel
          {...shared}
          total={payment.charge.total}
          method="POINT"
          cardType={null}
          amount={payment.charge.applied}
          surplusRefund={{
            amount: payment.charge.surplus,
            sentByCloud: payment.charge.surplus_sent_by_cloud,
          }}
        />
      );
  }
}
