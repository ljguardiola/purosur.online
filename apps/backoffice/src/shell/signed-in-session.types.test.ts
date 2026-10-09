import type { Capability, ManualStockMovementKind } from "@purosur/domain";
import { expectTypeOf, test } from "vitest";
import type { SessionOutcome } from "../sessions/session-api";
import type { SignedInSession } from "./root-route";

type ExpiryAndAccess = {
  expiresAt: string;
  capabilities: Capability[];
  stockMovementKinds: ManualStockMovementKind[];
  mayEmitOwnPinCode: boolean;
};

test("an open session read from the cloud always carries its expiry and access", () => {
  expectTypeOf<
    Pick<Extract<SessionOutcome, { kind: "ok" }>, keyof ExpiryAndAccess>
  >().toEqualTypeOf<ExpiryAndAccess>();
});

test("the shell's signed-in session always carries its expiry and access", () => {
  expectTypeOf<Pick<SignedInSession, keyof ExpiryAndAccess>>().toEqualTypeOf<ExpiryAndAccess>();
});
