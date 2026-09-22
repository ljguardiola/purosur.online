import { describe, expect, it } from "vitest";
import { recoveryTokenErrorResponse } from "./recovery-token-error-response.js";

describe("recoveryTokenErrorResponse", () => {
  it("maps invalid to 404 recovery_token_invalid", () => {
    expect(recoveryTokenErrorResponse("invalid")).toMatchObject({
      statusCode: 404,
      code: "recovery_token_invalid",
    });
  });

  it("maps burned to 409 recovery_token_burned", () => {
    expect(recoveryTokenErrorResponse("burned")).toMatchObject({
      statusCode: 409,
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
