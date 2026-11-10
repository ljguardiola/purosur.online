import type { RegisterStatus } from "@purosur/contracts";
import type { LocalAlertSubject } from "@purosur/ui";
import { expectTypeOf, test } from "vitest";

test("every condition the register detects itself has a local alert text to show", () => {
  expectTypeOf<RegisterStatus["conditions"][number]>().toExtend<LocalAlertSubject>();
});
