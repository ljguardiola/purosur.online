import type { AlertKind } from "@purosur/domain";
import type { LocalAlertKind } from "@purosur/ui";
import { expectTypeOf, test } from "vitest";

test("every kind with a local text is a kind the domain's catalog names", () => {
  expectTypeOf<LocalAlertKind>().toExtend<AlertKind>();
});
