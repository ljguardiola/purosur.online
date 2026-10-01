import { describe, expect, it } from "vitest";
import { registerAbilities } from "../../register/index.js";
import { PIN_SIGN_IN_LOCKOUT_FAILURES } from "../model/pin-sign-in-failures.js";
import { type SignInAtRegisterPorts, signInAtRegister } from "./sign-in-at-register.js";
import { pinCheckFixture } from "./test-support/fake-pin-sign-in-store.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SELLER = {
  isAdministrator: false,
  permissionKeys: ["sell_and_charge", "view_sales_history"],
};

function fixture(
  options: { openedBy?: string; access?: typeof SELLER; resumeFails?: boolean } = {},
) {
  const created = pinCheckFixture(NOW);
  created.store.seedHolder("person-1", {
    firstName: "Ana",
    access: options.access ?? SELLER,
    credential: "123456",
  });
  const calls: string[] = [];
  let openSession = options.openedBy === undefined ? undefined : { openedBy: options.openedBy };
  const ports: SignInAtRegisterPorts<string, string> = {
    ...created.ports,
    signedInPerson: {
      clear: () => calls.push("clear"),
      set: (userId) => calls.push(`set ${userId}`),
    },
    register: {
      openSession: () => openSession,
      sessionToResume: (userId) => {
        calls.push(`resume ${userId}`);
        if (options.resumeFails) {
          throw new Error("the session cannot be read");
        }
        return `session of ${userId}`;
      },
    },
    rememberedPeople: { remember: (userId) => calls.push(`remember ${userId}`) },
  };
  return {
    ...created,
    ports,
    calls,
    openSessionBy(userId: string) {
      openSession = { openedBy: userId };
    },
  };
}

function signIn(created: ReturnType<typeof fixture>, pin: string, remember = false) {
  return signInAtRegister(created.ports, { userId: "person-1", pin, remember });
}

describe("signInAtRegister", () => {
  it("signs the person in with the abilities their role gives at the register", async () => {
    const created = fixture();

    expect(await signIn(created, "123456")).toEqual({
      kind: "signed_in",
      person: {
        userId: "person-1",
        firstName: "Ana",
        abilities: registerAbilities(SELLER),
      },
      resumedSession: "session of person-1",
    });
    expect(created.calls).toEqual(["clear", "resume person-1", "set person-1"]);
  });

  it("signs in the person who opened the register's cash session", async () => {
    const created = fixture({ openedBy: "person-1" });

    expect((await signIn(created, "123456")).kind).toBe("signed_in");
  });

  it("clears the signed-in person even when the sign-in is refused", async () => {
    const created = fixture();

    await signIn(created, "000000");

    expect(created.calls).toEqual(["clear"]);
  });

  it("refuses a cash session opened by another person before looking at the PIN", async () => {
    const created = fixture({ openedBy: "person-2" });

    expect(await signIn(created, "123456")).toEqual({ kind: "cash_session_opened_by_another" });
    expect(created.matching.matched).toEqual([]);
    expect(created.store.failures.size).toBe(0);
    expect(created.calls).toEqual(["clear"]);
  });

  it("refuses an unknown person as a wrong PIN, without counting or matching", async () => {
    const created = fixture();

    expect(
      await signInAtRegister(created.ports, { userId: "nobody", pin: "123456", remember: false }),
    ).toEqual({ kind: "wrong_pin", retryAfterSeconds: 0, attemptsLeft: 7 });
    expect(created.store.failures.size).toBe(0);
    expect(created.matching.matched).toEqual([]);
  });

  it("returns a refusal of the PIN check as it is", async () => {
    const created = fixture();

    expect(await signIn(created, "000000")).toEqual({
      kind: "wrong_pin",
      retryAfterSeconds: 0,
      attemptsLeft: 7,
    });
  });

  it("returns a lockout as it is", async () => {
    const created = fixture();
    created.store.seedFailures("person-1", {
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
      lastFailedAt: NOW,
    });

    expect(await signIn(created, "123456")).toEqual({
      kind: "locked",
      consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
    });
  });

  it("returns unavailable when the PIN cannot be checked", async () => {
    const created = fixture();
    created.matching.unavailable = true;

    expect(await signIn(created, "123456")).toEqual({ kind: "unavailable" });
  });

  it("refuses a right PIN of a person whose role gives no register permission", async () => {
    const created = fixture({ access: { isAdministrator: false, permissionKeys: [] } });

    expect(await signIn(created, "123456")).toEqual({ kind: "no_register_permission" });
    expect(created.calls).toEqual(["clear"]);
  });

  it("refuses again when another person opens a cash session while the PIN is being checked", async () => {
    const created = fixture();
    created.matching.hold();

    const pending = signIn(created, "123456", true);
    await Promise.resolve();
    created.openSessionBy("person-2");
    created.matching.release();

    expect(await pending).toEqual({ kind: "cash_session_opened_by_another" });
    expect(created.calls).toEqual(["clear"]);
  });

  it("remembers the person on this register only when asked", async () => {
    const asked = fixture();
    const notAsked = fixture();

    await signIn(asked, "123456", true);
    await signIn(notAsked, "123456", false);

    expect(asked.calls).toEqual(["clear", "resume person-1", "remember person-1", "set person-1"]);
    expect(notAsked.calls).toEqual(["clear", "resume person-1", "set person-1"]);
  });

  it("does not remember a person whose sign-in is refused", async () => {
    const created = fixture();

    await signIn(created, "000000", true);

    expect(created.calls).toEqual(["clear"]);
  });

  it("reads the session the person resumes only after the last look at the cash session", async () => {
    const created = fixture();
    created.matching.hold();

    const pending = signIn(created, "123456");
    await Promise.resolve();
    created.openSessionBy("person-2");
    created.matching.release();
    await pending;

    expect(created.calls).not.toContain("resume person-1");
  });

  it("remembers and signs in nobody when the session the person resumes cannot be read", async () => {
    const created = fixture({ resumeFails: true });

    await expect(signIn(created, "123456", true)).rejects.toThrow("the session cannot be read");
    expect(created.calls).toEqual(["clear", "resume person-1"]);
  });
});
