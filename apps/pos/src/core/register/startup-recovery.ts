export interface StartupRecoveryDeps {
  settleInterruptedAuthorizations: () => Promise<void>;
  followInterruptedCharges:
    | (() => Promise<{ failures: { paymentTransactionId: string; error: unknown }[] }>)
    | undefined;
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
  startSync,
  reportFailure,
}: StartupRecoveryDeps): StartupRecovery {
  const authorizationsSettled = settleInterruptedAuthorizations().catch((error: unknown) =>
    reportFailure("settling the interrupted real-time authorizations", error),
  );
  const finished = authorizationsSettled.then(async () => {
    await followCharges(followInterruptedCharges, reportFailure);
    startSync();
  });
  return { authorizationsSettled, finished };
}

async function followCharges(
  followInterruptedCharges: StartupRecoveryDeps["followInterruptedCharges"],
  reportFailure: StartupRecoveryDeps["reportFailure"],
): Promise<void> {
  if (followInterruptedCharges === undefined) {
    return;
  }
  try {
    const { failures } = await followInterruptedCharges();
    for (const { paymentTransactionId, error } of failures) {
      reportFailure(`following the interrupted Mercado Pago charge ${paymentTransactionId}`, error);
    }
  } catch (error) {
    reportFailure("following the interrupted Mercado Pago charges", error);
  }
}
