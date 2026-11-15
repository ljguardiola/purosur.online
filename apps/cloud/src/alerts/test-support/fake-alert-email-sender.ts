import type {
  AlertEmail,
  AlertEmailSender,
  AlertEmailSendResult,
} from "@purosur/domain/alerts/use-cases";

export class FakeAlertEmailSender implements AlertEmailSender {
  readonly sent: AlertEmail[] = [];
  private readonly answer: AlertEmailSendResult;

  constructor(answer: AlertEmailSendResult = { kind: "sent", providerMessageId: "msg-1" }) {
    this.answer = answer;
  }

  async sendAlertEmail(email: AlertEmail): Promise<AlertEmailSendResult> {
    this.sent.push(email);
    return this.answer;
  }
}
