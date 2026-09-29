import { describe, expect, it } from "vitest";
import { recoveryTokenBodySchema } from "./recovery-token.js";

describe("recoveryTokenBodySchema", () => {
  it("accepts a recovery token untouched", () => {
    const result = recoveryTokenBodySchema.safeParse({ recovery_token: " raw-token " });

    expect(result).toMatchObject({ success: true, data: { recovery_token: " raw-token " } });
  });

  it.each([undefined, "", 42, null, {}])("rejects the recovery token %j", (recovery_token) => {
    const result = recoveryTokenBodySchema.safeParse({ recovery_token });

    const issue = result.success ? undefined : result.error.issues[0];
    expect({ field: issue?.path[0], message: issue?.message }).toEqual({
      field: "recovery_token",
      message: "recovery_token is required",
    });
  });
});
