import { describe, expect, it } from "vitest";
import {
  authorizationRefusalSchema,
  authorizationSchema,
  authorizedBySchema,
} from "./authorization.js";

describe("authorizationSchema", () => {
  it("accepts the person picked and the PIN as typed", () => {
    const authorization = { user_id: "u2", pin: "482913" };

    expect(authorizationSchema.parse(authorization)).toEqual(authorization);
  });

  it("refuses an authorization without a PIN", () => {
    expect(authorizationSchema.safeParse({ user_id: "u2" }).success).toBe(false);
  });

  it("refuses an authorization without a person", () => {
    expect(authorizationSchema.safeParse({ pin: "482913" }).success).toBe(false);
  });

  it("drops fields it does not know", () => {
    expect(authorizationSchema.parse({ user_id: "u2", pin: "482913", extra: true })).toEqual({
      user_id: "u2",
      pin: "482913",
    });
  });
});

describe("authorizedBySchema", () => {
  it("accepts the person who authorized", () => {
    const person = { user_id: "u2", first_name: "Ada" };

    expect(authorizedBySchema.parse(person)).toEqual(person);
  });

  it("refuses a person without a name", () => {
    expect(authorizedBySchema.safeParse({ user_id: "u2" }).success).toBe(false);
  });

  it("refuses a person without an id", () => {
    expect(authorizedBySchema.safeParse({ first_name: "Ada" }).success).toBe(false);
  });
});

describe("authorizationRefusalSchema", () => {
  it.each(["wrong_pin", "lacks_permission", "unavailable"])(
    "accepts a refusal of kind %s",
    (kind) => {
      expect(authorizationRefusalSchema.parse({ kind })).toEqual({ kind });
    },
  );

  it("refuses a kind it does not know", () => {
    expect(authorizationRefusalSchema.safeParse({ kind: "authorized" }).success).toBe(false);
  });
});
