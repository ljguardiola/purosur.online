import {
  isWsaaTokenDueForRenewal,
  isWsaaTokenRetryDue,
  WSAA_ALREADY_AUTHENTICATED_RETRY_MINUTES,
} from "../model/wsaa-token.js";
import type { WsaaTokenPorts } from "./wsaa-token-ports.js";

export interface RenewWsaaTokenInput {
  service: string;
  certificateFingerprint: string;
}

export type RenewWsaaTokenOutcome =
  | { kind: "kept" }
  | { kind: "renewed" }
  | { kind: "waiting" }
  | { kind: "already_authenticated" }
  | { kind: "failed" };

export async function renewWsaaToken(
  { store, authentication, clock }: WsaaTokenPorts,
  { service, certificateFingerprint }: RenewWsaaTokenInput,
): Promise<RenewWsaaTokenOutcome> {
  return store.holdRenewal<RenewWsaaTokenOutcome>(
    service,
    certificateFingerprint,
    async (renewal) => {
      const persisted = await renewal.persistedToken();
      if (!isWsaaTokenDueForRenewal(persisted, clock.now())) {
        return { kind: "kept" };
      }
      if (!isWsaaTokenRetryDue(await renewal.lastRefusal(), clock.now())) {
        return { kind: "waiting" };
      }

      const result = await authentication.requestToken(service);
      const answeredAt = clock.now();
      if (result.kind === "issued") {
        return renewal.recordAnswer<RenewWsaaTokenOutcome>(async (answer) => {
          await answer.recordIssuedToken(result.token);
          await answer.clearRefusal();
          await answer.clearTicketHeldElsewhere(answeredAt);
          await answer.resumeWorkWaitingOnToken();
          return { kind: "renewed" };
        });
      }
      if (result.kind === "already_authenticated") {
        return renewal.recordAnswer<RenewWsaaTokenOutcome>(async (answer) => {
          await answer.recordRefusal(answeredAt);
          await answer.recordTicketHeldElsewhere(
            answeredAt,
            WSAA_ALREADY_AUTHENTICATED_RETRY_MINUTES,
          );
          return { kind: "already_authenticated" };
        });
      }
      return { kind: result.kind };
    },
  );
}
