import { describe, expect, it } from "vitest";
import { AlertAlreadyOpenError } from "./alert-store.js";

describe("AlertAlreadyOpenError", () => {
  it("names the kind and the scope that already has an open alert", () => {
    const error = new AlertAlreadyOpenError("user_email_changed", "user-1");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AlertAlreadyOpenError");
    expect(error.message).toBe("an alert of kind user_email_changed is already open for user-1");
    expect(error.kind).toBe("user_email_changed");
    expect(error.scope).toBe("user-1");
  });
});
