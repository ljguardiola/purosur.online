import { describe, expect, it } from "vitest";
import { listSignInUsers } from "./list-sign-in-users.js";
import { signInAtRegister } from "./sign-in-at-register.js";
import { pinCheckFixture } from "./test-support/fake-pin-sign-in-store.js";
import { fakeRememberedPeople } from "./test-support/fake-remembered-people.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SELLER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const PEOPLE = [
  { id: "person-1", firstName: "Ana" },
  { id: "person-2", firstName: "Beto" },
];

function fixture() {
  const created = pinCheckFixture(NOW);
  created.store.seedHolder("person-1", { firstName: "Ana", access: SELLER, credential: "123456" });
  created.store.seedHolder("person-2", { firstName: "Beto", access: SELLER, credential: "654321" });
  const rememberedPeople = fakeRememberedPeople(PEOPLE);
  const ports = {
    ...created.ports,
    signedInPerson: { clear: () => undefined, set: () => undefined },
    register: { openSession: () => undefined, sessionToResume: () => "session" },
    rememberedPeople,
  };
  return {
    rememberedPeople,
    signIn: (userId: string, pin: string, remember = false) =>
      signInAtRegister(ports, { userId, pin, remember }),
  };
}

describe("listSignInUsers", () => {
  it("lists nobody and marks nobody on a register nobody was remembered on", () => {
    const { rememberedPeople } = fixture();

    expect(listSignInUsers({ rememberedPeople })).toEqual({ users: [], lastActiveUserId: null });
  });

  it("marks nobody for people remembered before anyone signed in", () => {
    const { rememberedPeople } = fixture();
    rememberedPeople.remember("person-1");

    expect(listSignInUsers({ rememberedPeople })).toEqual({
      users: [{ id: "person-1", firstName: "Ana" }],
      lastActiveUserId: null,
    });
  });

  it("marks the person who signed in for the first time", async () => {
    const { rememberedPeople, signIn } = fixture();

    await signIn("person-1", "123456", true);

    expect(listSignInUsers({ rememberedPeople })).toEqual({
      users: [{ id: "person-1", firstName: "Ana" }],
      lastActiveUserId: "person-1",
    });
  });

  it("marks only the second person once they sign in", async () => {
    const { rememberedPeople, signIn } = fixture();
    await signIn("person-1", "123456", true);

    await signIn("person-2", "654321", true);

    expect(listSignInUsers({ rememberedPeople })).toEqual({
      users: [
        { id: "person-1", firstName: "Ana" },
        { id: "person-2", firstName: "Beto" },
      ],
      lastActiveUserId: "person-2",
    });
  });

  it("keeps the person marked when they sign in again", async () => {
    const { rememberedPeople, signIn } = fixture();
    await signIn("person-1", "123456", true);
    await signIn("person-2", "654321", true);

    await signIn("person-2", "654321");

    expect(listSignInUsers({ rememberedPeople }).lastActiveUserId).toBe("person-2");
  });

  it("moves the mark back to a person who signs in after another", async () => {
    const { rememberedPeople, signIn } = fixture();
    await signIn("person-1", "123456", true);
    await signIn("person-2", "654321", true);

    await signIn("person-1", "123456");

    expect(listSignInUsers({ rememberedPeople }).lastActiveUserId).toBe("person-1");
  });

  it("keeps the mark when a later sign-in is refused", async () => {
    const { rememberedPeople, signIn } = fixture();
    await signIn("person-1", "123456", true);

    await signIn("person-2", "000000");

    expect(listSignInUsers({ rememberedPeople }).lastActiveUserId).toBe("person-1");
  });
});
