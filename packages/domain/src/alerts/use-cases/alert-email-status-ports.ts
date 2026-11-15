export type QueriedAlertEmailStatus =
  | { kind: "answered"; status: string; alertDeliveryId: string | null }
  | { kind: "unavailable" };

export interface AlertEmailStatusQuery {
  queriedAlertEmailStatus(providerMessageId: string): Promise<QueriedAlertEmailStatus>;
}

export interface SentAlertEmail {
  deliveryId: string;
}

export interface AlertEmailStatusStore {
  hasAlertEmailSendInFlight(): Promise<boolean>;
  sentAlertEmailOfProviderMessage(providerMessageId: string): Promise<SentAlertEmail | undefined>;
  isAlertEmailDeliveryPending(deliveryId: string): Promise<boolean>;
  recordEmailUndelivered(deliveryId: string): Promise<void>;
}

export interface ApplyQueriedAlertEmailStatusPorts {
  store: AlertEmailStatusStore;
  statusQuery: AlertEmailStatusQuery;
}
