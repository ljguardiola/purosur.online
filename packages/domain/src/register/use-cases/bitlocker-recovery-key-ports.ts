import type { Clock } from "../../shared/index.js";

export interface NewBitlockerRecoveryKey {
  installationId: string;
  recoveryKey: string;
  keyIdentifier: string;
  loadedAt: Date;
  loadedBy: string;
}

export interface HeldBitlockerRecoveryKey {
  recoveryKey: string;
  keyIdentifier: string;
}

export interface BitlockerRecoveryKeyLoad {
  registerId: string;
  installationId: string;
  actorId: string;
  at: Date;
}

export type BitlockerRecoveryKeyConsultation = BitlockerRecoveryKeyLoad;

export interface BitlockerRecoveryKeyStoreTransaction {
  lockBranchRegister(branchId: string, registerId: string): Promise<boolean>;
  // The installation in service, if any.
  currentInstallationOf(registerId: string): Promise<string | null>;
  hasRecoveryKey(installationId: string): Promise<boolean>;
  storeRecoveryKey(key: NewBitlockerRecoveryKey): Promise<void>;
  recoveryKeyOf(installationId: string): Promise<HeldBitlockerRecoveryKey | null>;
  recordRecoveryKeyLoaded(load: BitlockerRecoveryKeyLoad): Promise<void>;
  recordRecoveryKeyConsulted(consultation: BitlockerRecoveryKeyConsultation): Promise<void>;
}

export interface BitlockerRecoveryKeyStore {
  transaction<TOutcome>(
    work: (tx: BitlockerRecoveryKeyStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BitlockerRecoveryKeyPorts {
  store: BitlockerRecoveryKeyStore;
  clock: Clock;
}
