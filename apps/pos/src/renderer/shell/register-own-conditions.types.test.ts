import type { RegisterOwnCondition } from "@purosur/domain";
import type { LocalAlertKind } from "@purosur/ui";
import { expectTypeOf, test } from "vitest";

test("every condition the register detects itself has a local alert text to show", () => {
  expectTypeOf<RegisterOwnCondition>().toExtend<LocalAlertKind>();
});
