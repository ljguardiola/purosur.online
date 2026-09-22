import { describe, expect, it } from "vitest";
import { recoveryTokenErrorResponse } from "./recovery-token-error-response.js";

describe("recoveryTokenErrorResponse", () => {
  it("maps invalid to 400 recovery_token_invalid", () => {
    expect(recoveryTokenErrorResponse("invalid")).toMatchObject({
      statusCode: 400,
      code: "recovery_token_invalid",
    });
  });

  it("maps burned to 410 recovery_token_burned", () => {
    expect(recoveryTokenErrorResponse("burned")).toMatchObject({
      statusCode: 410,
      code: "recovery_token_burned",
    });
  });

  it("maps expired to 410 recovery_token_expired", () => {
    expect(recoveryTokenErrorResponse("expired")).toMatchObject({
      statusCode: 410,
      code: "recovery_token_expired",
    });
  });
});
