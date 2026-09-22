export interface SendRecoveryLinkInput {
  to: string;
  link: string;
}

/**
 * The boundary between the recovery-request worker task and whatever actually delivers the
 * email, so a test never has to reach the network to exercise the task's own logic.
 */
export interface RecoveryEmailSender {
  sendRecoveryLink(input: SendRecoveryLinkInput): Promise<void>;
}
