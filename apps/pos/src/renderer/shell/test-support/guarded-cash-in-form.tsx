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
import { useKeys } from "../../platform/key-layer";
import { AuthorizationModal } from "../authorization-modal";
import type { SignedInPerson } from "../signed-in-person";
import { useAuthorization } from "../use-authorization";

export type GuardedCashInOutcome =
  | { kind: "performed"; authorized_by: AuthorizedBy | null }
  | AuthorizationRefusal;

export type GuardedCashInFormProps = {
  person: SignedInPerson;
  required: boolean;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  submit: (authorization: Authorization | undefined) => Promise<GuardedCashInOutcome>;
};

export function GuardedCashInForm({
  person,
  required,
  loadAuthorizers,
  submit,
}: GuardedCashInFormProps) {
  const authorization = useAuthorization({
    permission: "record_cash_in",
    loadAuthorizers,
    required,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<AuthorizedBy | null | undefined>();
  const [shortcutUsed, setShortcutUsed] = useState(false);
  useKeys([{ key: "F9", run: () => setShortcutUsed(true) }]);

  async function attempt() {
    if (submitting) {
      return;
    }
    if (!authorization.ready) {
      authorization.ask();
      return;
    }
    setSubmitting(true);
    const outcome = await submit(authorization.value);
    setSubmitting(false);
    if (outcome.kind === "performed") {
      authorization.performed();
      setDone(outcome.authorized_by);
    } else {
      authorization.refuse(outcome);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void attempt();
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <p>Operador: {person.first_name}</p>
      <Button type="submit" disabled={submitting}>
        Cargar
      </Button>
      {shortcutUsed ? <p>Atajo de la pantalla usado</p> : null}
      {done === undefined ? null : (
        <p>
          {done === null
            ? "Cargado por el operador"
            : `Cargado con autorización de ${done.first_name}`}
        </p>
      )}
      <AuthorizationModal
        authorization={authorization}
        subtitle="Registrar ingreso"
        action="cargar movimientos de efectivo"
        submitting={submitting}
        onConfirm={() => void attempt()}
      />
    </form>
  );
}
