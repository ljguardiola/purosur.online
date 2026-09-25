import type { PermissionKey } from "@purosur/contracts";
import { InlineNotice } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { ShieldX, TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import { messages } from "./messages";
import { roleFieldErrorMessage, validateRoleName } from "./RoleForm";
import type { CreateRoleOutcome, createRole } from "./rolesApi";
import { navigate } from "./router";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { ROLES_LIST_PATH } from "./settingsRoutes";

const rolesMessages = messages.settings.roles;

export type RoleCreationServices = {
  createRole: typeof createRole;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export type RoleCreationNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

/**
 * The New and Duplicate role pages' shared form state and save: validates the name, attempts
 * `POST /roles` directly and, only when the cloud answers `authorization_required`, confirms with
 * the shared passkey-authorization modal and retries once, then returns to the roles list or keeps
 * the form with the outcome's field error or notice. Cancelling the modal leaves the form exactly
 * as it was.
 */
export function useRoleCreation({
  services,
  onSessionEnded,
}: {
  services: RoleCreationServices;
  onSessionEnded: () => void;
}) {
  const { createRole, fetchSessionAuthorizationOptions, authorizeSession, startAuthentication } =
    services;
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<RoleCreationNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<CreateRoleOutcome>({
    action: "roleSave",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

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

    const outcome = await run(() =>
      createRole({ name: name.trim(), permissionKeys: Array.from(selected) }),
    );
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok") {
      navigate(ROLES_LIST_PATH);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
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
    modal,
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
