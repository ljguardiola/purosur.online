import type {
  ChargeSaleWithPaidOrderOutcome,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
} from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
import type { CompletedCharge } from "./cash-charge-modal";
import type { CompletedPointPayment } from "./point-payment-wait-modal";
import type { CompletedQrPayment } from "./qr-payment-wait-modal";
import { SaleCompletedModal } from "./sale-completed-modal";
import type { CompletedStandaloneTerminal } from "./standalone-terminal-charge-modal";
import type { CompletedTransfer } from "./transfer-charge-modal";

export type CompletedPaidOrder = Extract<ChargeSaleWithPaidOrderOutcome, { kind: "completed" }>;

export type CompletedPayment =
  | { method: "CASH"; charge: CompletedCharge }
  | { method: "TRANSFER"; charge: CompletedTransfer }
  | { method: "STANDALONE_TERMINAL"; charge: CompletedStandaloneTerminal }
  | { method: "QR"; charge: CompletedQrPayment }
  | { method: "POINT"; cardType: PointCardType | null; charge: CompletedPointPayment }
  | { method: "PAID_ORDER"; orderMethod: "QR" | "POINT"; charge: CompletedPaidOrder };

export function ChargeCompletedModal({
  saleId,
  payment,
  readReceiptStatus,
  readBackupTicket,
  readBackupTickets,
  mayChangePrinter,
  onNewSale,
}: {
  saleId: string;
  payment: CompletedPayment;
  readReceiptStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  readBackupTicket: (saleId: string) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  readBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  mayChangePrinter: boolean;
  onNewSale: () => void;
}) {
  const shared = {
    saleId,
    readReceiptStatus,
    readBackupTicket,
    readBackupTickets,
    mayChangePrinter,
    onNewSale,
  };
  switch (payment.method) {
    case "CASH":
      return (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          tendered={payment.charge.tendered}
          change={payment.charge.change}
        />
      );
    case "TRANSFER":
      return (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          method="TRANSFER"
          amount={payment.charge.amount}
        />
      );
    case "STANDALONE_TERMINAL":
      return (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          method="STANDALONE_TERMINAL"
          amount={payment.charge.amount}
        />
      );
    case "QR":
      return (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          method="QR"
          amount={payment.charge.amount}
        />
      );
    case "POINT":
      return (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          method="POINT"
          cardType={payment.cardType}
          amount={payment.charge.amount}
        />
      );
    case "PAID_ORDER":
      return payment.orderMethod === "QR" ? (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          method="QR"
          amount={payment.charge.applied}
          surplus={payment.charge.surplus}
        />
      ) : (
        <SaleCompletedModal
          {...shared}
          total={payment.charge.total}
          method="POINT"
          cardType={null}
          amount={payment.charge.applied}
          surplus={payment.charge.surplus}
        />
      );
  }
}
