import { describe, expect, it } from "vitest";
import { deriveUserHandle } from "./recovery-user-handle.js";

const USER_ID_A = "0f8c4b8e-9c3a-4b7a-8e2b-1f2b3c4d5e6f";
const USER_ID_B = "aa8c4b8e-9c3a-4b7a-8e2b-1f2b3c4d5e6f";

describe("deriveUserHandle", () => {
  it("derives the same handle for the same user id every time", () => {
    expect(deriveUserHandle(USER_ID_A)).toEqual(deriveUserHandle(USER_ID_A));
  });

  it("derives different handles for different user ids", () => {
    expect(deriveUserHandle(USER_ID_A)).not.toEqual(deriveUserHandle(USER_ID_B));
  });

  it("derives a 16-byte handle from a UUID", () => {
    expect(deriveUserHandle(USER_ID_A)).toHaveLength(16);
  });
});
