import { expect, test } from "vitest";
import { groupedCode } from "./grouped-code";

test("groups a code in fours", () => {
  expect(groupedCode("P4NX7KWE2QRT8MZD")).toBe("P4NX 7KWE 2QRT 8MZD");
  expect(groupedCode("P4NX7K")).toBe("P4NX 7K");
});
