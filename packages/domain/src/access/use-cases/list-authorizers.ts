import { mayAuthorize, type RegisterOperation } from "../../register/index.js";
import type { RoleAccess } from "../model/access-increase.js";
import { type AuthorizablePermissionKey, holdsPermission } from "../model/holds-permission.js";

export interface SignablePerson {
  id: string;
  firstName: string;
  access: RoleAccess;
}

export interface ListAuthorizersPorts {
  people: { signablePeople(): SignablePerson[] };
}

export type ListAuthorizersInput =
  | { kind: "permission"; permission: AuthorizablePermissionKey }
  | { kind: "operation"; operation: RegisterOperation };

export function listAuthorizers(
  { people }: ListAuthorizersPorts,
  input: ListAuthorizersInput,
): { id: string; firstName: string }[] {
  return people
    .signablePeople()
    .filter(({ id, access }) =>
      input.kind === "permission"
        ? holdsPermission(access, input.permission)
        : mayAuthorize(input.operation, { id, access }),
    )
    .map(({ id, firstName }) => ({ id, firstName }));
}
