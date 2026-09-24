import type { PermissionKey } from "@purosur/contracts";
import { InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON, startAuthentication } from "@simplewebauthn/browser";
import { ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { messages } from "./messages";
import { roleFieldErrorMessage, validateRoleName } from "./RoleForm";
import type { createRole, fetchRoleCreationChallenge } from "./rolesApi";
import { navigate } from "./router";
import { ROLES_LIST_PATH, sendToMyAccount } from "./settingsRoutes";

const rolesMessages = messages.settings.roles;

export type RoleCreationServices = {
  fetchRoleCreationChallenge: typeof fetchRoleCreationChallenge;
  createRole: typeof createRole;
  startAuthentication: typeof startAuthentication;
};

export type RoleCreationNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

/**
 * The New and Duplicate role pages' shared form state and save: validates the name, confirms with a
 * passkey step-up, creates the role through `POST /roles` and returns to the roles list, or keeps
 * the form with the outcome's field error or notice.
 */
export function useRoleCreation({
  services,
  onSessionEnded,
}: {
  services: RoleCreationServices;
  onSessionEnded: () => void;
}) {
  const { fetchRoleCreationChallenge, createRole, startAuthentication } = services;
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<RoleCreationNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Stable across renders (every dependency is a setter, which React guarantees never changes), so
  // a caller's load callback can depend on it without recreating on every render.
  const fill = useCallback((nextName: string, nextSelected: ReadonlySet<PermissionKey>) => {
    setName(nextName);
    setSelected(nextSelected);
    setNameError(undefined);
  }, []);

  function changeName(value: string) {
    setName(value);
    if (nameError) {
      setNameError(validateRoleName(value));
    }
  }

  async function submit() {
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
    if (challenge.kind === "forbidden") {
      sendToMyAccount();
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
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "name_taken") {
      setNameError(rolesMessages.form.nameTaken);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      setNameError(roleFieldErrorMessage(outcome.field));
      if (roleFieldErrorMessage(outcome.field) === undefined) {
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

  return {
    name,
    changeName,
    nameError,
    selected,
    setSelected,
    fill,
    notice,
    submitting,
    submit,
  };
}

/** The notice a failed or rate-limited creation leaves above the form; nothing otherwise. */
export function RoleCreationNoticeView({ notice }: { notice: RoleCreationNotice | null }) {
  if (notice?.kind === "attemptFailed") {
    return (
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title={rolesMessages.roleCreation.attemptFailedTitle}
        detail={rolesMessages.rolePage.attemptFailedDetail}
      />
    );
  }
  if (notice?.kind === "rateLimited") {
    return (
      <InlineNotice
        tone="error"
        icon={<ShieldX />}
        title={rolesMessages.rateLimitedTitle}
        detail={rolesMessages.rateLimitedDetail({
          minutes: Math.ceil(notice.retryAfterSeconds / 60),
        })}
      />
    );
  }
  return null;
}
