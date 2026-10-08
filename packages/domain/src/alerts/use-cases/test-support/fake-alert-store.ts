import type { Clock } from "../../../shared/index.js";
import type { AlertKind, AlertLevel } from "../../model/alert-catalog.js";
import type {
  AlertClosure,
  AlertEscalation,
  AlertRecipientCandidate,
  AlertStore,
  AlertStoreTransaction,
  ClearedConditionAlert,
  LockedAlert,
  LockedConditionAlert,
  LockedOpenAlert,
  NewAlert,
  SourceAddressHasher,
} from "../alert-store.js";
import { AlertAlreadyOpenError } from "../alert-store.js";

export interface FakeAlert extends Omit<NewAlert, "detail"> {
  id: string;
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  conditionClearedAt: Date | null;
  detail: Record<string, unknown>;
}

export interface FakeAlertViewer extends AlertRecipientCandidate {
  active: boolean;
}

interface FakeAlertDelivery {
  alertId: string;
  recipientUserId: string;
}

export interface FakeAlertState {
  alerts: FakeAlert[];
  viewers: FakeAlertViewer[];
  deliveries: FakeAlertDelivery[];
  nextId: number;
}

export type AlertWriteOperation =
  | "insertAlert"
  | "recordBackofficeDeliveries"
  | "recordClosure"
  | "recordEscalation"
  | "recordConditionCleared"
  | "recordConditionHolding";

class FakeAlertStoreTransaction implements AlertStoreTransaction {
  private readonly state: FakeAlertState;
  private readonly store: FakeAlertStore;
  private readonly operations: string[];

  constructor(state: FakeAlertState, store: FakeAlertStore, operations: string[]) {
    this.state = state;
    this.store = store;
    this.operations = operations;
  }

  async insertAlert(alert: NewAlert): Promise<string> {
    this.beforeWrite("insertAlert");
    const duplicate =
      alert.deduplicates &&
      this.state.alerts.some(
        (row) =>
          row.deduplicates &&
          row.resolvedAt === null &&
          row.kind === alert.kind &&
          row.scope === alert.scope,
      );
    if (duplicate || this.store.loseDedupRace) {
      throw new AlertAlreadyOpenError(alert.kind, alert.scope);
    }
    const id = `alert-${this.state.nextId++}`;
    this.state.alerts.push({
      ...structuredClone(alert),
      detail: { ...structuredClone(alert.detail) },
      id,
      escalatedAt: null,
      resolvedAt: null,
      resolvedBy: null,
      conditionClearedAt: null,
    });
    return id;
  }

  async findOpenAlertId(kind: AlertKind, scope: string): Promise<string | undefined> {
    this.record("findOpenAlertId");
    return this.state.alerts.find(
      (row) => row.kind === kind && row.scope === scope && row.resolvedAt === null,
    )?.id;
  }

  async listActiveAlertViewers(): Promise<AlertRecipientCandidate[]> {
    this.record("listActiveAlertViewers");
    return this.state.viewers
      .filter((viewer) => viewer.active)
      .map(({ active: _active, ...viewer }) => structuredClone(viewer));
  }

  async recordBackofficeDeliveries(
    alertId: string,
    recipientUserIds: readonly string[],
  ): Promise<void> {
    this.beforeWrite("recordBackofficeDeliveries");
    for (const recipientUserId of recipientUserIds) {
      this.state.deliveries.push({ alertId, recipientUserId });
    }
  }

  async lockAlert(alertId: string): Promise<LockedAlert | undefined> {
    this.record("lockAlert");
    const alert = this.state.alerts.find((row) => row.id === alertId);
    return alert && structuredClone(alert);
  }

  async recordClosure(alertId: string, closure: AlertClosure): Promise<void> {
    this.beforeWrite("recordClosure");
    const alert = this.find(alertId);
    alert.resolvedAt = new Date(closure.closedAt);
    alert.resolvedBy = closure.closedBy;
    alert.scope = closure.scope;
    alert.detail = structuredClone(closure.detail);
  }

  async lockOpenAlerts(): Promise<LockedOpenAlert[]> {
    this.record("lockOpenAlerts");
    return this.state.alerts
      .filter((row) => row.resolvedAt === null)
      .map((row) => ({
        alertId: row.id,
        level: row.level,
        resolvedAt: null,
        escalateAt: row.escalateAt && new Date(row.escalateAt),
      }));
  }

  async recordEscalation(alertIds: readonly string[], escalation: AlertEscalation): Promise<void> {
    this.beforeWrite("recordEscalation");
    for (const alertId of alertIds) {
      const alert = this.find(alertId);
      alert.level = escalation.level;
      alert.escalatedAt = new Date(escalation.escalatedAt);
    }
  }

  async lockOpenAlertOfKey(
    kind: AlertKind,
    scope: string,
  ): Promise<LockedConditionAlert | undefined> {
    this.record("lockOpenAlertOfKey");
    if (this.store.hideOpenAlertFromLock) {
      return undefined;
    }
    const alert = this.state.alerts.find(
      (row) => row.kind === kind && row.scope === scope && row.resolvedAt === null,
    );
    return (
      alert && {
        alertId: alert.id,
        detail: structuredClone(alert.detail),
        conditionClearedAt: alert.conditionClearedAt && new Date(alert.conditionClearedAt),
      }
    );
  }

  async recordConditionCleared(alertId: string, clearedAt: Date): Promise<void> {
    this.beforeWrite("recordConditionCleared");
    this.find(alertId).conditionClearedAt = new Date(clearedAt);
  }

  async recordConditionHolding(alertId: string): Promise<void> {
    this.beforeWrite("recordConditionHolding");
    this.find(alertId).conditionClearedAt = null;
  }

  async lockClearedConditionAlerts(): Promise<ClearedConditionAlert[]> {
    this.record("lockClearedConditionAlerts");
    return this.state.alerts.flatMap((row) =>
      row.resolvedAt === null && row.conditionClearedAt !== null
        ? [
            {
              alertId: row.id,
              kind: row.kind,
              scope: row.scope,
              detail: structuredClone(row.detail),
              conditionClearedAt: new Date(row.conditionClearedAt),
            },
          ]
        : [],
    );
  }

  private find(alertId: string): FakeAlert {
    const alert = this.state.alerts.find((row) => row.id === alertId);
    if (!alert) {
      throw new Error(`no alert ${alertId}`);
    }
    return alert;
  }

  private record(operation: string): void {
    this.store.operationOrder.push(operation);
    this.operations.push(operation);
  }

  private beforeWrite(operation: AlertWriteOperation): void {
    this.record(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeAlertStore implements AlertStore {
  private state: FakeAlertState = { alerts: [], viewers: [], deliveries: [], nextId: 1 };

  failingWrites = new Set<AlertWriteOperation>();
  loseDedupRace = false;
  hideOpenAlertFromLock = false;
  operationOrder: string[] = [];
  operationsByTransaction: string[][] = [];

  seedViewer(viewer: FakeAlertViewer): void {
    this.state.viewers.push(structuredClone(viewer));
  }

  seedAlert(alert: Omit<FakeAlert, "id"> & { id?: string }): string {
    const id = alert.id ?? `alert-${this.state.nextId++}`;
    this.state.alerts.push({ ...structuredClone(alert), id });
    return id;
  }

  snapshot(): FakeAlertState {
    return structuredClone(this.state);
  }

  levelOf(alertId: string): AlertLevel | undefined {
    return this.state.alerts.find((row) => row.id === alertId)?.level;
  }

  async transaction<TOutcome>(
    work: (tx: AlertStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    const operations: string[] = [];
    this.operationsByTransaction.push(operations);
    try {
      return await work(new FakeAlertStoreTransaction(this.state, this, operations));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

export class FixedClock implements Clock {
  private readonly moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }
}

export class PrefixHasher implements SourceAddressHasher {
  hash(address: string): string {
    return `hash-of-${address}`;
  }
}
