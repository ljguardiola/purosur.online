export interface SendRecoveryLinkInput {
  to: string;
  link: string;
}

export interface SendFirstPinCodeInput {
  to: string;
  code: string;
}

interface RecoveryEmailSender {
  sendRecoveryLink(input: SendRecoveryLinkInput): Promise<void>;
}

export interface FirstPinCodeEmailSender {
  sendFirstPinCode(input: SendFirstPinCodeInput): Promise<void>;
}

export type AccessEmailSender = RecoveryEmailSender & FirstPinCodeEmailSender;
