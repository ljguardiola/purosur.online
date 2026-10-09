import type { SignInUser } from "@purosur/contracts";
import {
  type ListAuthorizersInput,
  type ListAuthorizersPorts,
  listAuthorizers,
} from "@purosur/domain/sessions/use-cases";

export function authorizersOf(
  people: ListAuthorizersPorts["people"],
  input: ListAuthorizersInput,
): SignInUser[] {
  return listAuthorizers({ people }, input).map(({ id, firstName }) => ({
    id,
    first_name: firstName,
  }));
}
