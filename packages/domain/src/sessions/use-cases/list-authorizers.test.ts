import { describe, expect, it } from "vitest";
import { listAuthorizers, type SignablePerson } from "./list-authorizers.js";

const CLOSER = "close_anothers_register_session";

function person(id: string, permissionKeys: string[], isAdministrator = false): SignablePerson {
  return { id, firstName: `First ${id}`, access: { isAdministrator, permissionKeys } };
}

function ports(people: SignablePerson[]) {
  return { people: { signablePeople: () => people } };
}

describe("listAuthorizers", () => {
  it("lists, in the store's order, the people who hold the permission", () => {
    const people = [person("c", [CLOSER]), person("a", []), person("b", [CLOSER])];

    expect(listAuthorizers(ports(people), { kind: "permission", permission: CLOSER })).toEqual([
      { id: "c", firstName: "First c" },
      { id: "b", firstName: "First b" },
    ]);
  });

  it("counts an administrator as holding the permission", () => {
    const people = [person("a", [], true)];

    expect(listAuthorizers(ports(people), { kind: "permission", permission: CLOSER })).toEqual([
      { id: "a", firstName: "First a" },
    ]);
  });

  it("lists nobody when nobody holds the permission", () => {
    expect(
      listAuthorizers(ports([person("a", [])]), { kind: "permission", permission: CLOSER }),
    ).toEqual([]);
  });

  it("lists the people who may authorize the operation", () => {
    const people = [person("opener", [CLOSER]), person("closer", [CLOSER]), person("a", [])];

    expect(
      listAuthorizers(ports(people), {
        kind: "operation",
        operation: { kind: "close_locked_register", session: { openedBy: "opener" } },
      }),
    ).toEqual([{ id: "closer", firstName: "First closer" }]);
  });

  it("lists nobody for an operation nobody else may authorize", () => {
    expect(
      listAuthorizers(ports([person("a", [], true)]), {
        kind: "operation",
        operation: { kind: "sell" },
      }),
    ).toEqual([]);
  });
});
