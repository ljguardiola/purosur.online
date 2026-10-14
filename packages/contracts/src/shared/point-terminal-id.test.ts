import { describe, expect, it } from "vitest";
import { pointTerminalIdSchema } from "./point-terminal-id.js";

const TERMINAL = "PAX_A910__SMARTPOS1234567890";
const MESSAGE = "terminal_id must be a Point terminal id without spaces";

describe("pointTerminalIdSchema", () => {
  it("reads a terminal id", () => {
    expect(pointTerminalIdSchema.parse(TERMINAL)).toBe(TERMINAL);
  });

  it("drops the whitespace around the id", () => {
    expect(pointTerminalIdSchema.parse(`  ${TERMINAL}\n`)).toBe(TERMINAL);
  });

  it.each(["", "   ", "PAX A910", 7, null, undefined])("refuses %j", (value) => {
    const result = pointTerminalIdSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(MESSAGE);
  });
});
