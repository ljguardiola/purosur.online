import { describe, expect, it } from "vitest";
import { createHeldMessages } from "./held-messages";

describe("messages held until the core is ready", () => {
  it("hands the messages that arrived before the core was ready over once it is, in order", () => {
    const held = createHeldMessages<string>();
    const handled: string[] = [];

    held.receive("renderer port");
    held.receive("credentials answer");
    expect(handled).toEqual([]);

    held.deliverTo((message) => handled.push(message));

    expect(handled).toEqual(["renderer port", "credentials answer"]);
  });

  it("hands each message that arrives once the core is ready over right away", () => {
    const held = createHeldMessages<string>();
    const handled: string[] = [];
    held.deliverTo((message) => handled.push(message));

    held.receive("renderer port");

    expect(handled).toEqual(["renderer port"]);
  });

  it("hands a message held before the core was ready over only once", () => {
    const held = createHeldMessages<string>();
    const handled: string[] = [];
    held.receive("renderer port");
    held.deliverTo((message) => handled.push(message));

    held.receive("credentials answer");

    expect(handled).toEqual(["renderer port", "credentials answer"]);
  });

  it("keeps the order when a held message's handling makes another one arrive", () => {
    const held = createHeldMessages<string>();
    const handled: string[] = [];
    held.receive("first");
    held.receive("second");

    held.deliverTo((message) => {
      handled.push(message);
      if (message === "first") {
        held.receive("third");
      }
    });

    expect(handled).toEqual(["first", "second", "third"]);
  });
});

describe("messages taken early", () => {
  function heldTakingCredentialsAnswers() {
    const early: string[] = [];
    const held = createHeldMessages<string>((message) => {
      if (message !== "credentials answer") {
        return false;
      }
      early.push(message);
      return true;
    });
    return { held, early };
  }

  it("hands a message the early handler takes to it right away, before the core is ready", () => {
    const { held, early } = heldTakingCredentialsAnswers();

    held.receive("credentials answer");

    expect(early).toEqual(["credentials answer"]);
  });

  it("holds the messages the early handler does not take, in order, and never delivers the taken one", () => {
    const { held } = heldTakingCredentialsAnswers();
    const handled: string[] = [];
    held.receive("renderer port");
    held.receive("credentials answer");
    held.receive("update hold release");

    held.deliverTo((message) => handled.push(message));

    expect(handled).toEqual(["renderer port", "update hold release"]);
  });
});
