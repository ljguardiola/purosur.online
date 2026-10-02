import type { AlertAudience, AlertKind, AlertLevel } from "../model/alert-catalog.js";
import type { AlertDetails } from "../model/alert-details.js";
import type { AlertViewer } from "../model/alert-visibility.js";

export interface Clock {
  now(): Date;
}

export interface SourceAddressHasher {
  hash(address: string): string;
}

export class AlertAlreadyOpenError extends Error {
  readonly kind: AlertKind;
  readonly scope: string;

  constructor(kind: AlertKind, scope: string) {
    super(`an alert of kind ${kind} is already open for ${scope}`);
    this.name = "AlertAlreadyOpenError";
    this.kind = kind;
    this.scope = scope;
  }
}

export interface NewAlert {
  kind: AlertKind;
  scope: string;
  level: AlertLevel;
  audience: AlertAudience;
  locationId: string | null;
  detail: AlertDetails[AlertKind];
  openedAt: Date;
  escalateAt: Date | null;
  deduplicates: boolean;
}

export interface AlertRecipientCandidate extends AlertViewer {
  userId: string;
}

export interface LockedAlert {
  kind: AlertKind;
  level: AlertLevel;
  escalatedAt: Date | null;
  scope: string;
  detail: Record<string, unknown>;
  resolvedAt: Date | null;
}

export interface AlertClosure {
  closedAt: Date;
  closedBy: string;
  scope: string;
  detail: Record<string, unknown>;
}

export interface LockedOpenAlert {
  alertId: string;
  level: AlertLevel;
  resolvedAt: null;
  escalateAt: Date | null;
}

export interface AlertEscalation {
  level: AlertLevel;
  escalatedAt: Date;
}

export interface AlertStoreTransaction {
  insertAlert(alert: NewAlert): Promise<string>;
  findOpenAlertId(kind: AlertKind, scope: string): Promise<string | undefined>;
  listActiveAlertViewers(): Promise<AlertRecipientCandidate[]>;
  recordBackofficeDeliveries(alertId: string, recipientUserIds: readonly string[]): Promise<void>;
  lockAlert(alertId: string): Promise<LockedAlert | undefined>;
  recordClosure(alertId: string, closure: AlertClosure): Promise<void>;
  lockOpenAlerts(): Promise<LockedOpenAlert[]>;
  recordEscalation(alertIds: readonly string[], escalation: AlertEscalation): Promise<void>;
}

export interface AlertStore {
  transaction<TOutcome>(work: (tx: AlertStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface AlertOpeningPorts {
  store: AlertStore;
  clock: Clock;
}

export interface AlertClosingPorts extends AlertOpeningPorts {
  hasher: SourceAddressHasher;
}
