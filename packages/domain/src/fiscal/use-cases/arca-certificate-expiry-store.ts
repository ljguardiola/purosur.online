export interface Clock {
  now(): Date;
}

export interface OpenCertificateExpiringAlert {
  alertId: string;
  notAfter: Date;
}

export interface NewCertificateExpiringAlert {
  environment: string;
  notAfter: Date;
  openedAt: Date;
}

export interface ArcaCertificateExpiryStoreTransaction {
  lockOpenCertificateExpiringAlert(
    environment: string,
  ): Promise<OpenCertificateExpiringAlert | undefined>;
  resolveCertificateExpiringAlert(alertId: string, resolvedAt: Date): Promise<void>;
  openCertificateExpiringAlert(alert: NewCertificateExpiringAlert): Promise<void>;
}

export interface ArcaCertificateExpiryStore {
  transaction<TOutcome>(
    work: (tx: ArcaCertificateExpiryStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ArcaCertificateExpiryPorts {
  store: ArcaCertificateExpiryStore;
  clock: Clock;
}
