import { expectTypeOf, test } from "vitest";
import type { SessionOutcome } from "../access/session-api";
import type { SignedInSession } from "./root-route";

type ExpiryAndPermissions = { expiresAt: string; permissions: string[] };

test("an open session read from the cloud always carries its expiry and permissions", () => {
  expectTypeOf<
    Pick<Extract<SessionOutcome, { kind: "ok" }>, keyof ExpiryAndPermissions>
  >().toEqualTypeOf<ExpiryAndPermissions>();
});

test("the shell's signed-in session always carries its expiry and permissions", () => {
  expectTypeOf<
    Pick<SignedInSession, keyof ExpiryAndPermissions>
  >().toEqualTypeOf<ExpiryAndPermissions>();
});
