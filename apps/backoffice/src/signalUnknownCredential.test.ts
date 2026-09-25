import { afterEach, expect, test, vi } from "vitest";
import { signalUnknownCredential } from "./signalUnknownCredential";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "PublicKeyCredential");
});

test("does nothing when the environment has no PublicKeyCredential at all", () => {
  expect(() =>
    signalUnknownCredential({ rpId: "purosur.online", credentialId: "cred-1" }),
  ).not.toThrow();
});

test("does nothing when PublicKeyCredential exists but has no signalUnknownCredential", () => {
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {};

  expect(() =>
    signalUnknownCredential({ rpId: "purosur.online", credentialId: "cred-1" }),
  ).not.toThrow();
});

test("calls signalUnknownCredential with the given rpId and credentialId when the browser supports it", () => {
  const signal = vi.fn().mockResolvedValue(undefined);
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
    signalUnknownCredential: signal,
  };

  signalUnknownCredential({ rpId: "purosur.online", credentialId: "cred-1" });

  expect(signal).toHaveBeenCalledWith({ rpId: "purosur.online", credentialId: "cred-1" });
});

test("swallows a rejection from signalUnknownCredential instead of throwing", async () => {
  const signal = vi.fn().mockRejectedValue(new Error("not allowed"));
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
    signalUnknownCredential: signal,
  };

  expect(() =>
    signalUnknownCredential({ rpId: "purosur.online", credentialId: "cred-1" }),
  ).not.toThrow();
  // Lets the swallowed rejection's microtask settle before the test ends.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("swallows signalUnknownCredential throwing synchronously instead of returning a promise", () => {
  const signal = vi.fn(() => {
    throw new Error("not allowed");
  });
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
    signalUnknownCredential: signal,
  };

  expect(() =>
    signalUnknownCredential({ rpId: "purosur.online", credentialId: "cred-1" }),
  ).not.toThrow();
});

test("swallows signalUnknownCredential returning a non-promise value", () => {
  const signal = vi.fn(() => undefined as never);
  (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
    signalUnknownCredential: signal,
  };

  expect(() =>
    signalUnknownCredential({ rpId: "purosur.online", credentialId: "cred-1" }),
  ).not.toThrow();
});
