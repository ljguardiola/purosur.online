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
  return store.transaction<RenewWsaaTokenOutcome>(async (tx) => {
    const persisted = await tx.lockWsaaToken(service, certificateFingerprint);
    if (!isWsaaTokenDueForRenewal(persisted, clock.now())) {
      return { kind: "kept" };
    }

    const result = await authentication.requestToken(service);
    if (result.kind !== "issued") {
      return { kind: result.kind };
    }
    await tx.recordWsaaToken(service, certificateFingerprint, result.token);
    return { kind: "renewed" };
  });
}
