import {
  ALERT_VIEW_PERMISSION_KEYS as SHARED_ALERT_VIEW_PERMISSION_KEYS,
  PERMISSION_KEYS as SHARED_PERMISSION_KEYS,
} from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import {
  ALERT_VIEW_PERMISSION_KEYS,
  isPermissionKey,
  PERMISSION_KEYS,
} from "./permission-catalog.js";

describe("the cloud's local permission key list", () => {
  it("matches the shared catalog's keys, in the same order", () => {
    expect(PERMISSION_KEYS).toEqual(SHARED_PERMISSION_KEYS);
  });

  it("matches the shared catalog's mutually exclusive alert-view pair", () => {
    expect(ALERT_VIEW_PERMISSION_KEYS).toEqual(SHARED_ALERT_VIEW_PERMISSION_KEYS);
  });

  it("accepts every shared catalog key and rejects an unknown one", () => {
    for (const key of SHARED_PERMISSION_KEYS) {
      expect(isPermissionKey(key)).toBe(true);
    }
    expect(isPermissionKey("not_a_real_permission")).toBe(false);
  });
});
