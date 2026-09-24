import type { PermissionKey } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, ShieldOff, ShieldX, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "./messages";
import { RoleForm, validateRoleName } from "./RoleForm";
import {
  type CreateRoleFieldError,
  createRole,
  fetchRoleCreationChallenge,
  fetchRoles,
  type RoleSummary,
} from "./rolesApi";
import { navigate } from "./router";
import { ROLES_LIST_PATH } from "./settingsRoutes";

export type DuplicateRoleScreenServices = {
  fetchRoles: typeof fetchRoles;
  fetchRoleCreationChallenge: typeof fetchRoleCreationChallenge;
  createRole: typeof createRole;
  startAuthentication: typeof startAuthentication;
};

export const defaultDuplicateRoleScreenServices: DuplicateRoleScreenServices = {
  fetchRoles,
  fetchRoleCreationChallenge,
  createRole,
  startAuthentication,
};

export type DuplicateRoleScreenProps = {
  /** The role this page pre-fills its name and permissions from. */
  roleId: string;
  /** From the session: only an Administrator can reach this page at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: DuplicateRoleScreenServices;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "forbidden" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded" };

type FormNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

const rolesMessages = messages.settings.roles;
const pageMessages = rolesMessages.duplicateRole;
const formMessages = rolesMessages.form;

function sourceDisplayName(role: RoleSummary): string {
  return role.isAdministrator ? rolesMessages.administratorRoleName : (role.name ?? "");
}

function fieldErrorMessage(field: CreateRoleFieldError): string | undefined {
  return field === "name" ? formMessages.nameFieldError : undefined;
}

/**
 * "Duplicar rol": opens like New role, but its name and permissions start pre-filled from an
 * existing role (found by scanning `GET /roles`'s own list, the only read that also carries the
 * Administrator role, which `GET /roles/:id` answers 404 for — see rolesApi.ts's fetchRole).
 * Saving goes through the exact same passkey step-up and `POST /roles` creation New role uses: the
 * duplicate is a brand-new role, never linked back to the one it started from.
 */
export function DuplicateRoleScreen({
  roleId,
  isAdministrator,
  onSessionEnded,
  services,
}: DuplicateRoleScreenProps) {
  const { fetchRoles, fetchRoleCreationChallenge, createRole, startAuthentication } =
    services ?? defaultDuplicateRoleScreenServices;
  const [state, setState] = useState<LoadState>(
    isAdministrator ? { kind: "loading" } : { kind: "forbidden" },
  );
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the source role and
  // discard whatever the Administrator has typed so far.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await fetchRoles();
    if (outcome.kind === "ok") {
      const source = outcome.value.find((role) => role.id === roleId);
      if (!source) {
        setState({ kind: "notFound" });
        return;
      }
      setName(pageMessages.nameFromOriginal({ name: sourceDisplayName(source) }));
      setSelected(new Set(source.permissionKeys as PermissionKey[]));
      setNameError(undefined);
      setState({ kind: "loaded" });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "rate_limited") {
      setState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      setState({ kind: "forbidden" });
    } else {
      setState({ kind: "loadError" });
    }
  }, [roleId, endSession, fetchRoles]);

  useEffect(() => {
    if (isAdministrator) {
      void load();
    }
  }, [isAdministrator, load]);

  if (state.kind === "forbidden") {
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
    if (state.kind !== "loaded") {
      return;
    }
    const error = validateRoleName(name);
    setNameError(error);
    if (error) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const challenge = await fetchRoleCreationChallenge();
    if (challenge.kind === "unauthenticated") {
      endSession();
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
      endSession();
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
        {state.kind === "loading" && <p role="status">{pageMessages.loading}</p>}
        {state.kind === "notFound" && (
          <InlineNotice tone="error" icon={<ShieldOff />} title={pageMessages.notFoundTitle} />
        )}
        {state.kind === "loadError" && (
          <>
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title={pageMessages.loadErrorTitle}
              detail={pageMessages.loadErrorDetail}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {rolesMessages.retry}
            </Button>
          </>
        )}
        {state.kind === "rate_limited" && (
          <>
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title={rolesMessages.rateLimitedTitle}
              detail={rolesMessages.rateLimitedDetail({
                minutes: Math.ceil(state.retryAfterSeconds / 60),
              })}
            />
            <Button variant="secondary" onPress={() => void load()}>
              {rolesMessages.retry}
            </Button>
          </>
        )}
        {state.kind === "loaded" && (
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
        )}
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
          isDisabled={submitting || state.kind !== "loaded"}
          onPress={() => void handleSubmit()}
        >
          {pageMessages.save}
        </Button>
      </div>
    </>
  );
}
