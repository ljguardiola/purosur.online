export interface InterruptedChargesFollowDeps<Interrupted> {
  follow:
    | ((
        interrupted: Interrupted,
      ) => Promise<{ failures: { paymentTransactionId: string; error: unknown }[] }>)
    | undefined;
  interrupted: Interrupted;
  reportFailure: (activity: string, error: unknown) => void;
}

export interface InterruptedChargesFollow {
  followNow(): Promise<void>;
}

export function createInterruptedChargesFollow<Interrupted>({
  follow,
  interrupted,
  reportFailure,
}: InterruptedChargesFollowDeps<Interrupted>): InterruptedChargesFollow {
  let underWay: Promise<void> | undefined;

  async function followOnce(): Promise<void> {
    if (follow === undefined) {
      return;
    }
    try {
      const { failures } = await follow(interrupted);
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
