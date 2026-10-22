import type { Clock } from "../../shared/index.js";
import type { AlertConditionObservation } from "../model/alert-condition-observation.js";

export interface PendingDeferredSaleForAlert {
  id: string;
  saleId: string;
  registerId: string;
  locationId: string;
  occurredAt: Date;
  total: number;
  shortCode: string;
}

export interface DeferredSaleDeadlineReader {
  pendingDeferredSales(): Promise<PendingDeferredSaleForAlert[]>;
}

export interface DeferredSaleDeadlineAlerts {
  dueAlertScopes(): Promise<string[]>;
  observeAlertCondition(observation: AlertConditionObservation): Promise<void>;
}

export interface DeferredSaleDeadlineDetectionPorts {
  deferredSales: DeferredSaleDeadlineReader;
  alerts: DeferredSaleDeadlineAlerts;
  clock: Clock;
}
