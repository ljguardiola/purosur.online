import type { AlertKind, RegisterOwnCondition } from "@purosur/domain";
import type { LocalAlertKind } from "@purosur/ui";
import { expectTypeOf, test } from "vitest";

test("every kind with a local text is a kind the domain's catalog or the register's own conditions name", () => {
  expectTypeOf<LocalAlertKind>().toExtend<AlertKind | RegisterOwnCondition>();
});
