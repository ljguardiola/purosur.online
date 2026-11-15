import type { Clock } from "../../shared/index.js";
import type { AlertLevel } from "../model/alert-catalog.js";
import type { AlertEmailFailureReason } from "../model/alert-email.js";
import type { AlertEmailStage, EmailedAlertKind } from "../model/alert-kind-policy.js";

export interface PendingAlertEmailDelivery {
  deliveryId: string;
  recipientUserId: string;
  alertId: string;
  kind: EmailedAlertKind;
  stage: AlertEmailStage;
  level: AlertLevel;
  occurredAt: Date;
  alertLocationId: string | null;
  attemptsMade: number;
  nextAttemptAt: Date | null;
}

export interface AlertEmailRecipient {
  email: string;
  active: boolean;
  alertEmailOptedIn: boolean;
}

export interface AlertEmailRecipientReader {
  alertEmailRecipient(userId: string): Promise<AlertEmailRecipient | undefined>;
}

export interface AlertEmailBranchReader {
  alertEmailBranchAddress(locationId: string): Promise<string | null>;
}

export interface AlertEmail {
  deliveryId: string;
  to: string;
  alertId: string;
  kind: EmailedAlertKind;
  stage: AlertEmailStage;
  level: AlertLevel;
  branchName: string | null;
  occurredAt: Date;
}

export type AlertEmailSendResult =
  | { kind: "sent"; providerMessageId: string }
  | { kind: "failed"; reason: AlertEmailFailureReason };

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
  reason: AlertEmailFailureReason;
  final: boolean;
}

export interface AlertEmailDeliveryStore {
  pendingEmailDeliveries(): Promise<PendingAlertEmailDelivery[]>;
  recordEmailAttempt(deliveryId: string, attempt: AlertEmailAttempt): Promise<void>;
  recordEmailSent(deliveryId: string, sent: AlertEmailSent): Promise<void>;
  recordEmailSkipped(deliveryId: string): Promise<void>;
  recordEmailFailure(deliveryId: string, failure: AlertEmailFailure): Promise<void>;
  recordEmailGivenUp(deliveryId: string): Promise<void>;
}

export type AlertEmailLaneRun<TOutcome> = { kind: "ran"; result: TOutcome } | { kind: "busy" };

export interface AlertEmailLanes {
  inAlertEmailLane<TOutcome>(
    work: (store: AlertEmailDeliveryStore) => Promise<TOutcome>,
  ): Promise<AlertEmailLaneRun<TOutcome>>;
}

export interface SendDueAlertEmailsPorts {
  lanes: AlertEmailLanes;
  recipients: AlertEmailRecipientReader;
  branches: AlertEmailBranchReader;
  sender: AlertEmailSender;
  clock: Clock;
}
