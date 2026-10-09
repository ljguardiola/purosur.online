import type {
  PaymentNotificationAdmission,
  PaymentNotificationAdmissionTransaction,
} from "../mercado-pago-notification-ports.js";

export interface FakeAdmittedNotification {
  sourceAddress: string;
  at: Date;
}

export class FakePaymentNotificationAdmission implements PaymentNotificationAdmission {
  admitted: FakeAdmittedNotification[] = [];
  calls: string[] = [];
  failRecording = false;

  admittedAt(sourceAddress: string): Date[] {
    return this.admitted
      .filter((notification) => notification.sourceAddress === sourceAddress)
      .map((notification) => notification.at);
  }

  async transaction<TOutcome>(
    work: (tx: PaymentNotificationAdmissionTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const working = structuredClone(this.admitted);
    const outcome = await work({
      lockNotificationAttempts: async (sourceAddress) => {
        this.calls.push(`lockNotificationAttempts ${sourceAddress}`);
      },
      admittedNotifications: async (sourceAddress, since) => {
        this.calls.push(`admittedNotifications ${sourceAddress}`);
        return working
          .filter(
            (notification) =>
              notification.sourceAddress === sourceAddress && notification.at > since,
          )
          .map((notification) => notification.at);
      },
      recordAdmittedNotification: async (sourceAddress, at) => {
        this.calls.push(`recordAdmittedNotification ${sourceAddress}`);
        if (this.failRecording) {
          throw new Error("the notification could not be recorded");
        }
        working.push({ sourceAddress, at });
      },
      forgetNotificationsThrough: async (sourceAddress, through) => {
        this.calls.push(`forgetNotificationsThrough ${sourceAddress}`);
        for (let index = working.length - 1; index >= 0; index -= 1) {
          const notification = working[index];
          if (notification?.sourceAddress === sourceAddress && notification.at <= through) {
            working.splice(index, 1);
          }
        }
      },
    });
    this.admitted = working.map((notification) => ({
      ...notification,
      at: new Date(notification.at),
    }));
    return outcome;
  }
}
