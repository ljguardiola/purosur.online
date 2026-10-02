import type { Capability } from "@purosur/domain";
import { expectTypeOf, test } from "vitest";
import type { SessionOutcome } from "../access/session-api";
import type { SignedInSession } from "./root-route";

type ExpiryAndCapabilities = { expiresAt: string; capabilities: Capability[] };

test("an open session read from the cloud always carries its expiry and capabilities", () => {
  expectTypeOf<
    Pick<Extract<SessionOutcome, { kind: "ok" }>, keyof ExpiryAndCapabilities>
  >().toEqualTypeOf<ExpiryAndCapabilities>();
});

test("the shell's signed-in session always carries its expiry and capabilities", () => {
  expectTypeOf<
    Pick<SignedInSession, keyof ExpiryAndCapabilities>
  >().toEqualTypeOf<ExpiryAndCapabilities>();
});
