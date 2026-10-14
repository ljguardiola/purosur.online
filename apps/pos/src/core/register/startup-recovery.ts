export interface StartupRecoveryDeps {
  settleInterruptedAuthorizations: () => Promise<void>;
  followInterruptedCharges: () => Promise<void>;
  discoverPaidOrders: () => Promise<void>;
  startSync: () => void;
  reportFailure: (activity: string, error: unknown) => void;
}

export interface StartupRecovery {
  authorizationsSettled: Promise<void>;
  finished: Promise<void>;
}

export function recoverAtStartup({
  settleInterruptedAuthorizations,
  followInterruptedCharges,
  discoverPaidOrders,
  startSync,
  reportFailure,
}: StartupRecoveryDeps): StartupRecovery {
  const authorizationsSettled = settleInterruptedAuthorizations().catch((error: unknown) =>
    reportFailure("settling the interrupted real-time authorizations", error),
  );
  const finished = authorizationsSettled.then(async () => {
    await followInterruptedCharges();
    await discoverPaidOrders();
    startSync();
  });
  return { authorizationsSettled, finished };
}
