import { expectTypeOf, test } from "vitest";
import type { OpenFiscalTask } from "./open-fiscal-task-reader.js";

test("an open fiscal task carries no alert, which alerts answers for it", () => {
  expectTypeOf<OpenFiscalTask>().not.toHaveProperty("alert");
});
