export type QueriedAlertEmailStatus =
  | { kind: "undelivered" }
  | { kind: "delivered" }
  | { kind: "in_transit" }
  | { kind: "unavailable" };

export interface AlertEmailStatusQuery {
  queriedAlertEmailStatus(providerMessageId: string): Promise<QueriedAlertEmailStatus>;
}

export interface SentAlertEmail {
  deliveryId: string;
}

export interface AlertEmailStatusStore {
  sentAlertEmailOfProviderMessage(providerMessageId: string): Promise<SentAlertEmail | undefined>;
  recordEmailUndelivered(deliveryId: string): Promise<void>;
}

export interface ApplyQueriedAlertEmailStatusPorts {
  store: AlertEmailStatusStore;
  statusQuery: AlertEmailStatusQuery;
}
