import { describe, expect, it } from "vitest";
import { createSignedInPerson } from "./signed-in-person";

describe("the signed-in person", () => {
  it("starts with nobody signed in", () => {
    expect(createSignedInPerson().userId()).toBeUndefined();
  });

  it("holds the person who signed in", () => {
    const signedIn = createSignedInPerson();

    signedIn.set("u1");

    expect(signedIn.userId()).toBe("u1");
  });

  it("replaces the person who was signed in with the next one", () => {
    const signedIn = createSignedInPerson();
    signedIn.set("u1");

    signedIn.set("u2");

    expect(signedIn.userId()).toBe("u2");
  });

  it("holds nobody once cleared", () => {
    const signedIn = createSignedInPerson();
    signedIn.set("u1");

    signedIn.clear();

    expect(signedIn.userId()).toBeUndefined();
  });

  it("does nothing when cleared with nobody signed in", () => {
    const signedIn = createSignedInPerson();

    signedIn.clear();

    expect(signedIn.userId()).toBeUndefined();
  });
});
