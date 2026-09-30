import { describe, expect, it } from "vitest";
import { emitFirstPinCode } from "./emit-first-pin-code.js";
import {
  FakePinCodeStore,
  FixedClock,
  hashOfPinCode,
  SequentialPinCodes,
} from "./test-support/fake-pin-code-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-29T12:15:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function storeWithUsers(): FakePinCodeStore {
  const store = new FakePinCodeStore();
  store.seedUser(
    "person-1",
    { isAdministrator: false, active: true },
    { email: "person-1@example.com" },
  );
  store.seedUser(
    "person-2",
    { isAdministrator: false, active: true },
    { hasPin: true, email: "person-2@example.com" },
  );
  return store;
}

function emit(store: FakePinCodeStore, userId: string, registerId = "register-1") {
  return emitFirstPinCode(
    { store, clock: new FixedClock(NOW), codes: new SequentialPinCodes() },
    { registerId, userId },
  );
}

describe("emitFirstPinCode", () => {
  describe("a person without a PIN", () => {
    it("is told the code's expiry and has it queued for the address on file", async () => {
      const store = storeWithUsers();

      expect(await emit(store, "person-1")).toEqual({ kind: "emitted", expiresAt: EXPIRES_AT });

      expect(store.snapshot().queuedEmails).toEqual([
        { email: "person-1@example.com", code: "PINCODE000000001", expiresAt: EXPIRES_AT },
      ]);
    });

    it("has the hash of the code stored, never the code, with no issuer and 15 minutes to live", async () => {
      const store = storeWithUsers();

      await emit(store, "person-1");

      const { codes } = store.snapshot();
      expect(codes).toEqual([
        {
          userId: "person-1",
          codeHash: hashOfPinCode("PINCODE000000001"),
          issuedBy: null,
          issuedAt: NOW,
          expiresAt: EXPIRES_AT,
          failedAttempts: 0,
          redeemedAt: null,
          supersededAt: null,
        },
      ]);
      expect(JSON.stringify(codes)).not.toContain('"PINCODE000000001"');
    });

    it("supersedes their earlier live codes and leaves the new one live", async () => {
      const store = storeWithUsers();
      store.seedCode({ userId: "person-1", issuedAt: minutesAgo(10) });

      await emit(store, "person-1");

      const [earlier, emitted] = store.snapshot().codes;
      expect(earlier?.supersededAt).toEqual(NOW);
      expect(emitted?.supersededAt).toBeNull();
    });

    it("leaves a redeemed code and other users' codes as they were", async () => {
      const store = storeWithUsers();
      store.seedCode({ userId: "person-1", issuedAt: minutesAgo(30), redeemedAt: minutesAgo(20) });
      store.seedCode({ userId: "person-2", issuedAt: minutesAgo(10) });

      await emit(store, "person-1");

      const [redeemed, otherUsers] = store.snapshot().codes;
      expect(redeemed?.supersededAt).toBeNull();
      expect(otherUsers?.supersededAt).toBeNull();
    });

    it("records the emission for the audit log with the register and without an actor, the code or its hash", async () => {
      const store = storeWithUsers();

      await emit(store, "person-1");

      expect(store.snapshot().firstEmissions).toEqual([
        { registerId: "register-1", userId: "person-1", expiresAt: EXPIRES_AT },
      ]);
    });

    it("rolls every write back when one of them fails", async () => {
      for (const failing of [
        "supersedeLivePinCodes",
        "recordPinCode",
        "recordFirstPinCodeEmission",
        "queueFirstPinCodeEmail",
      ] as const) {
        const store = storeWithUsers();
        store.seedCode({ userId: "person-1", issuedAt: minutesAgo(10) });
        store.failingWrites.add(failing);
        const before = store.snapshot();

        await expect(emit(store, "person-1")).rejects.toThrow(`${failing} failed`);

        expect(store.snapshot()).toEqual(before);
      }
    });
  });

  describe("a person who already has a PIN", () => {
    it("is refused, keeps their PIN and nothing is written", async () => {
      const store = storeWithUsers();
      const before = store.snapshot();

      expect(await emit(store, "person-2")).toEqual({
        kind: "pin_already_set",
      });

      expect(store.snapshot()).toEqual(before);
      expect(store.snapshot().pins.has("person-2")).toBe(true);
    });

    it("is refused as such even when the hourly cap is reached", async () => {
      const store = storeWithUsers();
      for (const minutes of [1, 2, 3, 4, 5]) {
        store.seedCode({ userId: "person-2", issuedAt: minutesAgo(minutes) });
      }

      expect(await emit(store, "person-2")).toEqual({ kind: "pin_already_set" });
    });

    it("never has their PIN removed by an emission for someone else", async () => {
      const store = storeWithUsers();

      await emit(store, "person-1");

      expect(store.snapshot().pins.has("person-2")).toBe(true);
    });
  });

  describe("someone the register cannot ask for", () => {
    it("is not found when the user does not exist", async () => {
      const store = storeWithUsers();
      const before = store.snapshot();

      expect(await emit(store, "nobody")).toEqual({ kind: "not_found" });

      expect(store.snapshot()).toEqual(before);
    });

    it("is not found when the user belongs to another location", async () => {
      const store = storeWithUsers();
      store.seedUser(
        "person-3",
        { isAdministrator: false, active: true },
        { registerIds: ["register-2"] },
      );
      const before = store.snapshot();

      expect(await emit(store, "person-3")).toEqual({ kind: "not_found" });

      expect(store.snapshot()).toEqual(before);
    });

    it("is not found when the user is inactive, even with a PIN or a reached cap", async () => {
      const store = storeWithUsers();
      store.seedUser("person-3", { isAdministrator: false, active: false }, { hasPin: true });
      for (const minutes of [1, 2, 3, 4, 5]) {
        store.seedCode({ userId: "person-3", issuedAt: minutesAgo(minutes) });
      }
      const before = store.snapshot();

      expect(await emit(store, "person-3")).toEqual({ kind: "not_found" });

      expect(store.snapshot()).toEqual(before);
    });
  });

  describe("the hourly cap", () => {
    function storeWithCodesIssued(...minutes: number[]): FakePinCodeStore {
      const store = storeWithUsers();
      for (const ago of minutes) {
        store.seedCode({ userId: "person-1", issuedAt: minutesAgo(ago) });
      }
      return store;
    }

    it("allows the fifth code in an hour", async () => {
      expect((await emit(storeWithCodesIssued(1, 2, 3, 4), "person-1")).kind).toBe("emitted");
    });

    it("refuses the sixth code until the oldest one leaves the hour, writing nothing", async () => {
      const store = storeWithCodesIssued(1, 2, 3, 4, 50);
      const before = store.snapshot();

      expect(await emit(store, "person-1")).toEqual({
        kind: "rate_limited",
        retryAfterSeconds: 10 * 60,
      });

      expect(store.snapshot()).toEqual(before);
    });

    it("counts the codes an administrator's reset issued, superseded or redeemed", async () => {
      const store = storeWithUsers();
      store.seedCode({
        userId: "person-1",
        issuedAt: minutesAgo(1),
        issuedBy: "admin-1",
        redeemedAt: minutesAgo(1),
      });
      store.seedCode({ userId: "person-1", issuedAt: minutesAgo(2), supersededAt: minutesAgo(1) });
      for (const ago of [3, 4, 5]) {
        store.seedCode({ userId: "person-1", issuedAt: minutesAgo(ago) });
      }

      expect((await emit(store, "person-1")).kind).toBe("rate_limited");
    });

    it("does not count the codes of other users", async () => {
      const store = storeWithUsers();
      for (const ago of [1, 2, 3, 4, 5]) {
        store.seedCode({ userId: "person-2", issuedAt: minutesAgo(ago) });
      }

      expect((await emit(store, "person-1")).kind).toBe("emitted");
    });
  });

  describe("the order it works in", () => {
    it("locks the user before counting its codes, counts before writing, and queues the email last", async () => {
      const store = storeWithUsers();

      await emit(store, "person-1");

      expect(store.operationOrder).toEqual([
        "lockFirstPinCodeTarget",
        "pinCodesIssuedSince",
        "supersedeLivePinCodes",
        "recordPinCode",
        "recordFirstPinCodeEmission",
        "queueFirstPinCodeEmail",
      ]);
    });

    it("counts codes only after the user's standing is settled", async () => {
      const store = storeWithUsers();

      await emit(store, "person-2");

      expect(store.operationOrder).toEqual(["lockFirstPinCodeTarget"]);
    });
  });
});
