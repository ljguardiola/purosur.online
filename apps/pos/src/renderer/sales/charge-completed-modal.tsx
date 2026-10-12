import type { ReceiptPrintStatusOutcome } from "@purosur/contracts";
import type { CompletedCharge } from "./cash-charge-modal";
import type { CompletedPointPayment } from "./point-payment-wait-modal";
import type { CompletedQrPayment } from "./qr-payment-wait-modal";
import { SaleCompletedModal } from "./sale-completed-modal";
import type { CompletedTransfer } from "./transfer-charge-modal";

export type CompletedPayment =
  | { method: "CASH"; charge: CompletedCharge }
  | { method: "TRANSFER"; charge: CompletedTransfer }
  | { method: "QR"; charge: CompletedQrPayment }
  | { method: "POINT"; charge: CompletedPointPayment };

export function ChargeCompletedModal({
  saleId,
  payment,
  readReceiptStatus,
  mayChangePrinter,
  onNewSale,
}: {
  saleId: string;
  payment: CompletedPayment;
  readReceiptStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  mayChangePrinter: boolean;
  onNewSale: () => void;
}) {
  const shared = { saleId, readReceiptStatus, mayChangePrinter, onNewSale };
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
          amount={payment.charge.amount}
        />
      );
  }
}
