import type { PermissionKey } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { messages } from "./messages";
import { RoleForm, validateRoleName } from "./RoleForm";
import { type CreateRoleFieldError, createRole, fetchRoleCreationChallenge } from "./rolesApi";
import { navigate } from "./router";
import { ROLES_LIST_PATH } from "./settingsRoutes";

export type NewRoleScreenServices = {
  fetchRoleCreationChallenge: typeof fetchRoleCreationChallenge;
  createRole: typeof createRole;
  startAuthentication: typeof startAuthentication;
};

export const defaultNewRoleScreenServices: NewRoleScreenServices = {
  fetchRoleCreationChallenge,
  createRole,
  startAuthentication,
};

export type NewRoleScreenProps = {
  /** From the session: only an Administrator can reach this page at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: NewRoleScreenServices;
};

const rolesMessages = messages.settings.roles;
const pageMessages = rolesMessages.newRole;
const formMessages = rolesMessages.form;

function fieldErrorMessage(field: CreateRoleFieldError): string | undefined {
  return field === "name" ? formMessages.nameFieldError : undefined;
}

type FormNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

/** "Nuevo rol": names a role and hand-picks its permissions, confirming with a passkey to save it. */
export function NewRoleScreen({ isAdministrator, onSessionEnded, services }: NewRoleScreenProps) {
  const { fetchRoleCreationChallenge, createRole, startAuthentication } =
    services ?? defaultNewRoleScreenServices;
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isAdministrator) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={rolesMessages.forbiddenTitle}
          detail={rolesMessages.forbiddenDetail}
        />
      </div>
    );
  }

  async function handleSubmit() {
    const error = validateRoleName(name);
    setNameError(error);
    if (error) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const challenge = await fetchRoleCreationChallenge();
    if (challenge.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (challenge.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: challenge.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    if (challenge.kind !== "ok") {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const reauthentication = await startAuthentication({
      optionsJSON: challenge.value.reauthenticationOptions,
    }).catch((): AuthenticationResponseJSON | null => null);
    if (!reauthentication) {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const outcome = await createRole(
      { name: name.trim(), permissionKeys: Array.from(selected) },
      reauthentication,
    );
    if (outcome.kind === "ok") {
      navigate(ROLES_LIST_PATH);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "name_taken") {
      setNameError(formMessages.nameTaken);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      setNameError(fieldErrorMessage(outcome.field));
      if (fieldErrorMessage(outcome.field) === undefined) {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{pageMessages.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">{pageMessages.heading}</h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={pageMessages.attemptFailedTitle}
            detail={pageMessages.attemptFailedDetail}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={pageMessages.rateLimitedTitle}
            detail={pageMessages.rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
        <RoleForm
          name={name}
          onNameChange={(value) => {
            setName(value);
            if (nameError) {
              setNameError(validateRoleName(value));
            }
          }}
          {...(nameError ? { nameError } : {})}
          selected={selected}
          onSelectedChange={setSelected}
        />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-line border-t bg-surface-white px-8 py-4">
        <Button
          variant="secondary"
          icon={<X />}
          isDisabled={submitting}
          onPress={() => navigate(ROLES_LIST_PATH)}
        >
          {pageMessages.cancel}
        </Button>
        <Button
          variant="primary"
          icon={<Check />}
          isDisabled={submitting}
          onPress={() => void handleSubmit()}
        >
          {pageMessages.save}
        </Button>
      </div>
    </>
  );
}
