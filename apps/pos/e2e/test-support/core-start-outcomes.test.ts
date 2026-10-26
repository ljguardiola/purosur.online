import { describe, expect, it } from "vitest";
import { coreStartEnded, startEndingsIn } from "./core-start-outcomes";

describe("a core start that missed its readiness deadline", () => {
  const line =
    "core process: not ready within 30000 ms, still at step apply_migrations after 28500 ms, so it was stopped";

  it("ends the start, naming the step it was at", () => {
    expect(coreStartEnded(`${line}\n`)).toBe(true);
    expect(startEndingsIn(`${line}\n`)).toEqual(["core process: not ready within"]);
  });
});
