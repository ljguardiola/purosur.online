import type { Clock } from "../../../shared/index.js";
import type {
  ArcaCertificateExpiryStore,
  ArcaCertificateExpiryStoreTransaction,
  NewCertificateExpiringAlert,
  OpenCertificateExpiringAlert,
} from "../arca-certificate-expiry-store.js";

interface FakeCertificateExpiringAlert extends NewCertificateExpiringAlert {
  alertId: string;
  resolvedAt: Date | null;
}

export interface FakeCertificateExpiryState {
  alerts: FakeCertificateExpiringAlert[];
  nextId: number;
}

export type CertificateExpiryWriteOperation =
  | "resolveCertificateExpiringAlert"
  | "openCertificateExpiringAlert";

class FakeTransaction implements ArcaCertificateExpiryStoreTransaction {
  private readonly state: FakeCertificateExpiryState;
  private readonly store: FakeArcaCertificateExpiryStore;

  constructor(state: FakeCertificateExpiryState, store: FakeArcaCertificateExpiryStore) {
    this.state = state;
    this.store = store;
  }

  async lockOpenCertificateExpiringAlert(
    environment: string,
  ): Promise<OpenCertificateExpiringAlert | undefined> {
    this.store.operationOrder.push("lockOpenCertificateExpiringAlert");
    const open = this.state.alerts.find(
      (alert) => alert.environment === environment && alert.resolvedAt === null,
    );
    return open && { alertId: open.alertId, notAfter: new Date(open.notAfter) };
  }

  async resolveCertificateExpiringAlert(alertId: string, resolvedAt: Date): Promise<void> {
    this.beforeWrite("resolveCertificateExpiringAlert");
    const alert = this.state.alerts.find((row) => row.alertId === alertId);
    if (!alert) {
      throw new Error(`no alert ${alertId}`);
    }
    alert.resolvedAt = new Date(resolvedAt);
  }

  async openCertificateExpiringAlert(alert: NewCertificateExpiringAlert): Promise<void> {
    this.beforeWrite("openCertificateExpiringAlert");
    this.state.alerts.push({
      alertId: `alert-${this.state.nextId++}`,
      environment: alert.environment,
      notAfter: new Date(alert.notAfter),
      openedAt: new Date(alert.openedAt),
      resolvedAt: null,
    });
  }

  private beforeWrite(operation: CertificateExpiryWriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

function cloneState(state: FakeCertificateExpiryState): FakeCertificateExpiryState {
  return {
    alerts: state.alerts.map((alert) => ({
      ...alert,
      notAfter: new Date(alert.notAfter),
      openedAt: new Date(alert.openedAt),
      resolvedAt: alert.resolvedAt && new Date(alert.resolvedAt),
    })),
    nextId: state.nextId,
  };
}

export class FakeArcaCertificateExpiryStore implements ArcaCertificateExpiryStore {
  private state: FakeCertificateExpiryState = { alerts: [], nextId: 1 };

  failingWrites = new Set<CertificateExpiryWriteOperation>();
  operationOrder: string[] = [];

  seedOpenAlert(environment: string, notAfter: Date): string {
    const alertId = `alert-${this.state.nextId++}`;
    this.state.alerts.push({
      alertId,
      environment,
      notAfter: new Date(notAfter),
      openedAt: new Date("2026-09-01T00:00:00.000Z"),
      resolvedAt: null,
    });
    return alertId;
  }

  snapshot(): FakeCertificateExpiryState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: ArcaCertificateExpiryStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = cloneState(this.state);
    try {
      return await work(new FakeTransaction(this.state, this));
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
