export interface InterruptedChargesFollowDeps {
  follow:
    | ((
        runStartedAt: Date,
      ) => Promise<{ failures: { paymentTransactionId: string; error: unknown }[] }>)
    | undefined;
  runStartedAt: Date;
  reportFailure: (activity: string, error: unknown) => void;
}

export interface InterruptedChargesFollow {
  followNow(): Promise<void>;
}

export function createInterruptedChargesFollow({
  follow,
  runStartedAt,
  reportFailure,
}: InterruptedChargesFollowDeps): InterruptedChargesFollow {
  let underWay: Promise<void> | undefined;

  async function followOnce(): Promise<void> {
    if (follow === undefined) {
      return;
    }
    try {
      const { failures } = await follow(runStartedAt);
      for (const { paymentTransactionId, error } of failures) {
        reportFailure(
          `following the interrupted Mercado Pago charge ${paymentTransactionId}`,
          error,
        );
      }
    } catch (error) {
      reportFailure("following the interrupted Mercado Pago charges", error);
    }
  }

  return {
    followNow: () => {
      underWay ??= followOnce().finally(() => {
        underWay = undefined;
      });
      return underWay;
    },
  };
}
