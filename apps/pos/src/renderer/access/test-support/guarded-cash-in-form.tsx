import type {
  Authorization,
  AuthorizationRefusal,
  AuthorizedBy,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button } from "@purosur/ui";
import type { FormEvent } from "react";
import { useState } from "react";
import { AuthorizationSection } from "../authorization-section";
import type { SignedInPerson } from "../signed-in-person";
import { useAuthorization } from "../use-authorization";

export type GuardedCashInOutcome =
  | { kind: "performed"; authorized_by: AuthorizedBy | null }
  | AuthorizationRefusal;

export type GuardedCashInFormProps = {
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  submit: (authorization: Authorization | undefined) => Promise<GuardedCashInOutcome>;
};

export function GuardedCashInForm({ person, loadAuthorizers, submit }: GuardedCashInFormProps) {
  const authorization = useAuthorization({
    person,
    permission: "record_cash_in",
    loadAuthorizers,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<AuthorizedBy | null | undefined>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !authorization.ready) {
      return;
    }
    setSubmitting(true);
    const outcome = await submit(authorization.value);
    setSubmitting(false);
    if (outcome.kind === "performed") {
      setDone(outcome.authorized_by);
    } else {
      authorization.refuse(outcome);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <p>Operador: {person.first_name}</p>
      <AuthorizationSection
        authorization={authorization}
        action="cargar movimientos de efectivo"
        disabled={submitting}
      />
      <Button type="submit" disabled={submitting || !authorization.ready}>
        Cargar
      </Button>
      {done === undefined ? null : (
        <p>
          {done === null
            ? "Cargado por el operador"
            : `Cargado con autorización de ${done.first_name}`}
        </p>
      )}
    </form>
  );
}
