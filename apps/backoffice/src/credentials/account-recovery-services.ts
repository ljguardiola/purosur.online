import { requestRecoveryLink } from "./recovery-api";

export type AccountRecoveryScreenServices = {
  requestRecoveryLink: typeof requestRecoveryLink;
};

export const defaultAccountRecoveryScreenServices: AccountRecoveryScreenServices = {
  requestRecoveryLink,
};
