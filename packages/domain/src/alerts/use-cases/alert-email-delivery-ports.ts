import type { Clock } from "../../shared/index.js";
import type { AlertKind, AlertLevel } from "../model/alert-catalog.js";
import type { AlertEmailStage } from "../model/alert-kind-policy.js";

export interface DueAlertEmailDelivery {
  deliveryId: string;
  to: string;
  alertId: string;
  kind: AlertKind;
  stage: AlertEmailStage;
  level: AlertLevel;
  occurredAt: Date;
  alertBranchName: string | null;
  recipientBranchName: string;
  attemptsMade: number;
}

export interface AlertEmail {
  deliveryId: string;
  to: string;
  alertId: string;
  kind: AlertKind;
  stage: AlertEmailStage;
  level: AlertLevel;
  branchName: string;
  occurredAt: Date;
}

export type AlertEmailSendResult =
  | { kind: "sent"; providerMessageId: string }
  | { kind: "failed"; error: string };

export interface AlertEmailSender {
  sendAlertEmail(email: AlertEmail): Promise<AlertEmailSendResult>;
}

export interface AlertEmailAttempt {
  attempt: number;
  nextAttemptAt: Date;
}

export interface AlertEmailSent {
  sentAt: Date;
  providerMessageId: string;
}

export interface AlertEmailFailure {
  error: string;
  final: boolean;
}

export interface AlertEmailDeliveryStore {
  dueEmailDeliveries(now: Date): Promise<DueAlertEmailDelivery[]>;
  recordEmailAttempt(deliveryId: string, attempt: AlertEmailAttempt): Promise<void>;
  recordEmailSent(deliveryId: string, sent: AlertEmailSent): Promise<void>;
  recordEmailFailure(deliveryId: string, failure: AlertEmailFailure): Promise<void>;
}

export interface AlertEmailLanes {
  inAlertEmailLane<TOutcome>(
    work: (store: AlertEmailDeliveryStore) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface SendDueAlertEmailsPorts {
  lanes: AlertEmailLanes;
  sender: AlertEmailSender;
  clock: Clock;
}
