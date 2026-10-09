import { describe, expect, it } from "vitest";
import { emitUserPinCode } from "./emit-user-pin-code.js";
import {
  FakePinCodeStore,
  FixedClock,
  hashOfPinCode,
  SequentialPinCodes,
} from "./test-support/fake-pin-code-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-29T12:15:00.000Z");

const PERSON = { id: "person-1", isAdministrator: false };
const ADMINISTRATOR = { id: "admin-1", isAdministrator: true };

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function storeWithUsers(): FakePinCodeStore {
  const store = new FakePinCodeStore();
  store.seedUser("person-1", { isAdministrator: false, active: true });
  store.seedUser("person-2", { isAdministrator: false, active: true }, { hasPin: true });
  store.seedUser("admin-1", { isAdministrator: true, active: true }, { hasPin: true });
  store.seedUser("admin-2", { isAdministrator: true, active: true }, { hasPin: true });
  return store;
}

function emit(
  store: FakePinCodeStore,
  actor: { id: string; isAdministrator: boolean },
  targetId: string,
) {
  return emitUserPinCode(
    { store, clock: new FixedClock(NOW), codes: new SequentialPinCodes() },
    { actor, targetId },
  );
}

describe("emitUserPinCode", () => {
  describe("who may emit for whom", () => {
    it.each([
      ["a person for another user who is not an Administrator", PERSON, "person-2"],
      ["an Administrator for a user who is not an Administrator", ADMINISTRATOR, "person-2"],
      ["an Administrator for another Administrator", ADMINISTRATOR, "admin-2"],
      ["an Administrator for their own account", ADMINISTRATOR, "admin-1"],
      ["a person for their own account", PERSON, "person-1"],
    ])("emits for %s", async (_label, actor, targetId) => {
      const outcome = await emit(storeWithUsers(), actor, targetId);

      expect(outcome).toEqual({
        kind: "emitted",
        code: "PINCODE000000001",
        expiresAt: EXPIRES_AT,
      });
    });

    it.each([
      ["a person for an Administrator", PERSON, "admin-1"],
      ["anyone for a user that does not exist", ADMINISTRATOR, "nobody"],
    ])("answers not_found and writes nothing for %s", async (_label, actor, targetId) => {
      const store = storeWithUsers();
      const before = store.snapshot();

      expect(await emit(store, actor, targetId)).toEqual({ kind: "not_found" });

      expect(store.snapshot()).toEqual(before);
    });

    it("answers not_found, not inactive, to a person aiming at an inactive Administrator", async () => {
      const store = storeWithUsers();
      store.seedUser("admin-3", { isAdministrator: true, active: false });

      expect(await emit(store, PERSON, "admin-3")).toEqual({ kind: "not_found" });
    });
  });

  describe("what an emission leaves behind", () => {
    it("stores the hash of the code, never the code, issued by the actor and expiring in 15 minutes", async () => {
      const store = storeWithUsers();

      await emit(store, PERSON, "person-2");

      const { codes } = store.snapshot();
      expect(codes).toEqual([
        {
          userId: "person-2",
          codeHash: hashOfPinCode("PINCODE000000001"),
          issuedBy: "person-1",
          issuedAt: NOW,
          expiresAt: EXPIRES_AT,
          failedAttempts: 0,
          redeemedAt: null,
          supersededAt: null,
        },
      ]);
      expect(JSON.stringify(codes)).not.toContain('"PINCODE000000001"');
    });

    it("removes the user's current PIN", async () => {
      const store = storeWithUsers();

      await emit(store, PERSON, "person-2");

      expect(store.snapshot().pins.has("person-2")).toBe(false);
    });

    it("keeps the PIN of every other user", async () => {
      const store = storeWithUsers();

      await emit(store, PERSON, "person-2");

      expect([...store.snapshot().pins.keys()].sort()).toEqual(["admin-1", "admin-2"]);
    });

    it("emits for a user who has no PIN yet", async () => {
      const store = storeWithUsers();

      expect((await emit(store, ADMINISTRATOR, "person-1")).kind).toBe("emitted");
    });

    it("supersedes the user's earlier live codes and leaves the new one live", async () => {
      const store = storeWithUsers();
      store.seedCode({ userId: "person-2", issuedAt: minutesAgo(10) });

      await emit(store, PERSON, "person-2");

      const [earlier, emitted] = store.snapshot().codes;
      expect(earlier?.supersededAt).toEqual(NOW);
      expect(emitted?.supersededAt).toBeNull();
    });

    it("leaves a redeemed code and other users' codes as they were", async () => {
      const store = storeWithUsers();
      const redeemedAt = minutesAgo(20);
      store.seedCode({ userId: "person-2", issuedAt: minutesAgo(30), redeemedAt });
      store.seedCode({ userId: "admin-1", issuedAt: minutesAgo(10) });

      await emit(store, PERSON, "person-2");

      const [redeemed, otherUsers] = store.snapshot().codes;
      expect(redeemed?.supersededAt).toBeNull();
      expect(otherUsers?.supersededAt).toBeNull();
    });

    it("records the emission for the audit log without the code or its hash", async () => {
      const store = storeWithUsers();

      await emit(store, PERSON, "person-2");

      const { emissions } = store.snapshot();
      expect(emissions).toEqual([
        { actorId: "person-1", userId: "person-2", expiresAt: EXPIRES_AT },
      ]);
    });

    it("rolls every write back when one of them fails", async () => {
      for (const failing of [
        "supersedeLivePinCodes",
        "removePin",
        "recordPinCode",
        "recordPinCodeEmission",
      ] as const) {
        const store = storeWithUsers();
        store.seedCode({ userId: "person-2", issuedAt: minutesAgo(10) });
        store.failingWrites.add(failing);
        const before = store.snapshot();

        await expect(emit(store, PERSON, "person-2")).rejects.toThrow(`${failing} failed`);

        expect(store.snapshot()).toEqual(before);
      }
    });
  });

  describe("an inactive user", () => {
    it("is refused and nothing is written", async () => {
      const store = storeWithUsers();
      store.seedUser("person-3", { isAdministrator: false, active: false }, { hasPin: true });
      const before = store.snapshot();

      expect(await emit(store, PERSON, "person-3")).toEqual({ kind: "inactive" });

      expect(store.snapshot()).toEqual(before);
    });

    it("is refused as inactive even when the hourly cap is reached", async () => {
      const store = storeWithUsers();
      store.seedUser("person-3", { isAdministrator: false, active: false });
      for (const minutes of [1, 2, 3, 4, 5]) {
        store.seedCode({ userId: "person-3", issuedAt: minutesAgo(minutes) });
      }

      expect(await emit(store, PERSON, "person-3")).toEqual({ kind: "inactive" });
    });
  });

  describe("the hourly cap", () => {
    function storeWithCodesIssued(...minutes: number[]): FakePinCodeStore {
      const store = storeWithUsers();
      for (const ago of minutes) {
        store.seedCode({ userId: "person-2", issuedAt: minutesAgo(ago) });
      }
      return store;
    }

    it("allows the fifth code in an hour", async () => {
      const outcome = await emit(storeWithCodesIssued(1, 2, 3, 4), PERSON, "person-2");

      expect(outcome.kind).toBe("emitted");
    });

    it("refuses the sixth code until the oldest one leaves the hour", async () => {
      const store = storeWithCodesIssued(1, 2, 3, 4, 50);
      const before = store.snapshot();

      expect(await emit(store, PERSON, "person-2")).toEqual({
        kind: "rate_limited",
        retryAfterSeconds: 10 * 60,
      });

      expect(store.snapshot()).toEqual(before);
    });

    it("counts superseded and redeemed codes too", async () => {
      const store = storeWithUsers();
      store.seedCode({ userId: "person-2", issuedAt: minutesAgo(1), redeemedAt: minutesAgo(1) });
      store.seedCode({ userId: "person-2", issuedAt: minutesAgo(2), supersededAt: minutesAgo(1) });
      for (const ago of [3, 4, 5]) {
        store.seedCode({ userId: "person-2", issuedAt: minutesAgo(ago) });
      }

      expect((await emit(store, PERSON, "person-2")).kind).toBe("rate_limited");
    });

    it("allows a code once the oldest of five has been issued a full hour ago", async () => {
      const outcome = await emit(storeWithCodesIssued(1, 2, 3, 4, 60), PERSON, "person-2");

      expect(outcome.kind).toBe("emitted");
    });

    it("does not count the codes of other users", async () => {
      const store = storeWithUsers();
      for (const ago of [1, 2, 3, 4, 5]) {
        store.seedCode({ userId: "admin-1", issuedAt: minutesAgo(ago) });
      }

      expect((await emit(store, PERSON, "person-2")).kind).toBe("emitted");
    });

    it("applies to an Administrator too", async () => {
      const store = storeWithUsers();
      for (const ago of [1, 2, 3, 4, 5]) {
        store.seedCode({ userId: "admin-1", issuedAt: minutesAgo(ago) });
      }

      expect((await emit(store, ADMINISTRATOR, "admin-1")).kind).toBe("rate_limited");
    });
  });

  describe("the order it works in", () => {
    it("locks the user before counting its codes, and counts before writing", async () => {
      const store = storeWithUsers();

      await emit(store, PERSON, "person-2");

      expect(store.operationOrder).toEqual([
        "lockPinCodeTarget",
        "pinCodesIssuedSince",
        "supersedeLivePinCodes",
        "removePin",
        "recordPinCode",
        "recordPinCodeEmission",
      ]);
    });

    it("counts codes only after the user's standing is settled", async () => {
      const store = storeWithUsers();

      await emit(store, PERSON, "admin-1");

      expect(store.operationOrder).toEqual(["lockPinCodeTarget"]);
    });
  });
});
