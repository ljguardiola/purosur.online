import type { Clock } from "../../shared/index.js";
import type { MercadoPagoOrders, PaymentTransactionLanes } from "./mercado-pago-order-ports.js";

export interface PaymentTransactionReference {
  id: string;
  registerId: string;
}

export interface PaymentTransactionDirectory {
  paymentTransactionOfOrder(providerOrderId: string): Promise<PaymentTransactionReference | null>;
  anyPaymentTransactionMayHaveUnrecordedOrder(): Promise<boolean>;
  paymentTransactionOfExternalReference(
    externalReference: string,
  ): Promise<PaymentTransactionReference | null>;
  pendingPaymentTransactions(): Promise<PaymentTransactionReference[]>;
}

export interface MercadoPagoNotificationPorts {
  directory: PaymentTransactionDirectory;
  lanes: PaymentTransactionLanes;
  mercadoPago: MercadoPagoOrders;
  clock: Clock;
}

export interface PaymentNotificationAdmission {
  transaction<TOutcome>(
    work: (tx: PaymentNotificationAdmissionTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PaymentNotificationAdmissionTransaction {
  lockNotificationAttempts(sourceAddress: string): Promise<void>;
  forgetNotificationsOutsideWindow(windowStart: Date): Promise<void>;
  admittedNotifications(sourceAddress: string, since: Date): Promise<Date[]>;
  recordAdmittedNotification(sourceAddress: string, at: Date): Promise<void>;
}

export interface PaymentNotificationAdmissionPorts {
  admission: PaymentNotificationAdmission;
  clock: Clock;
}
