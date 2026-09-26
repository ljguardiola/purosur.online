export interface SendRecoveryLinkInput {
  to: string;
  link: string;
}

export interface RecoveryEmailSender {
  sendRecoveryLink(input: SendRecoveryLinkInput): Promise<void>;
}
