import { isWsaaTokenDueForRenewal } from "../model/wsaa-token.js";
import type { WsaaTokenPorts } from "./wsaa-token-ports.js";

export interface RenewWsaaTokenInput {
  service: string;
  certificateFingerprint: string;
}

export type RenewWsaaTokenOutcome =
  | { kind: "kept" }
  | { kind: "renewed" }
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

      const result = await authentication.requestToken(service);
      if (result.kind !== "issued") {
        return { kind: result.kind };
      }
      await renewal.recordIssuedToken(result.token);
      return { kind: "renewed" };
    },
  );
}
