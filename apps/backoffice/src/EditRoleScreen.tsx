import type { PermissionKey } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, RotateCcw, ShieldOff, ShieldX, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "./messages";
import { RoleForm, validateRoleName } from "./RoleForm";
import {
  type EditRoleFieldError,
  editRole,
  fetchRole,
  fetchRoleEditChallenge,
  type RoleDetail,
} from "./rolesApi";
import { navigate } from "./router";
import { ROLES_LIST_PATH } from "./settingsRoutes";

export type EditRoleScreenServices = {
  fetchRole: typeof fetchRole;
  fetchRoleEditChallenge: typeof fetchRoleEditChallenge;
  editRole: typeof editRole;
  startAuthentication: typeof startAuthentication;
};

export const defaultEditRoleScreenServices: EditRoleScreenServices = {
  fetchRole,
  fetchRoleEditChallenge,
  editRole,
  startAuthentication,
};

export type EditRoleScreenProps = {
  roleId: string;
  /** From the session: only an Administrator can reach this page at all. */
  isAdministrator: boolean;
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: EditRoleScreenServices;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "forbidden" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "loaded"; role: RoleDetail };

type FormNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; offersReload: boolean }
  | { kind: "staleVersion" }
  | { kind: "reloadFailed" };

const rolesMessages = messages.settings.roles;
const pageMessages = rolesMessages.editRole;
const formMessages = rolesMessages.form;

function fieldErrorMessage(field: EditRoleFieldError): string | undefined {
  return field === "name" ? formMessages.nameFieldError : undefined;
}

/** "Editar rol": pre-filled with a hand-made role's current name and permissions, confirming with a passkey to save. */
export function EditRoleScreen({
  roleId,
  isAdministrator,
  onSessionEnded,
  services,
}: EditRoleScreenProps) {
  const { fetchRole, fetchRoleEditChallenge, editRole, startAuthentication } =
    services ?? defaultEditRoleScreenServices;
  const [state, setState] = useState<LoadState>(
    isAdministrator ? { kind: "loading" } : { kind: "forbidden" },
  );
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<PermissionKey>>(new Set());
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the role and discard
  // whatever the Administrator has typed so far.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);

  // Stable across renders (every dependency is a setter, which React guarantees never changes),
  // so `load` and `handleReload` below can depend on it without recreating on every render.
  const fillFrom = useCallback((role: RoleDetail) => {
    setName(role.name ?? "");
    setSelected(new Set(role.permissionKeys as PermissionKey[]));
    setNameError(undefined);
  }, []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await fetchRole(roleId);
    if (outcome.kind === "ok") {
      setState({ kind: "loaded", role: outcome.value });
      fillFrom(outcome.value);
      setNotice(null);
    } else if (outcome.kind === "not_found") {
      setState({ kind: "notFound" });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "rate_limited") {
      setState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind === "forbidden") {
      setState({ kind: "forbidden" });
    } else {
      setState({ kind: "loadError" });
    }
  }, [roleId, endSession, fetchRole, fillFrom]);

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

  async function handleReload() {
    setSubmitting(true);
    const outcome = await fetchRole(roleId);
    if (outcome.kind === "ok") {
      setState({ kind: "loaded", role: outcome.value });
      fillFrom(outcome.value);
      setNotice(null);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      endSession();
      return;
    }
    if (outcome.kind === "not_found") {
      setState({ kind: "notFound" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "forbidden") {
      setState({ kind: "forbidden" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: outcome.retryAfterSeconds,
        offersReload: true,
      });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
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

    const challenge = await fetchRoleEditChallenge(roleId);
    if (challenge.kind === "unauthenticated") {
      endSession();
      return;
    }
    if (challenge.kind === "not_found") {
      setState({ kind: "notFound" });
      setSubmitting(false);
      return;
    }
    if (challenge.kind === "forbidden") {
      setState({ kind: "forbidden" });
      setSubmitting(false);
      return;
    }
    if (challenge.kind === "rate_limited") {
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: challenge.retryAfterSeconds,
        offersReload: false,
      });
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

    const outcome = await editRole(
      roleId,
      { name: name.trim(), permissionKeys: Array.from(selected), version: state.role.version },
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
    if (outcome.kind === "not_found") {
      setState({ kind: "notFound" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "name_taken") {
      setNameError(formMessages.nameTaken);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
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
      setNotice({
        kind: "rateLimited",
        retryAfterSeconds: outcome.retryAfterSeconds,
        offersReload: false,
      });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  const offersReload =
    notice?.kind === "staleVersion" ||
    notice?.kind === "reloadFailed" ||
    (notice?.kind === "rateLimited" && notice.offersReload);

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
        {notice?.kind === "staleVersion" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={pageMessages.staleVersionTitle}
            detail={pageMessages.staleVersionDetail}
          />
        )}
        {notice?.kind === "reloadFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={pageMessages.reloadFailedTitle}
            detail={pageMessages.attemptFailedDetail}
          />
        )}
        {offersReload && (
          <Button
            variant="secondary"
            icon={<RotateCcw />}
            isDisabled={submitting}
            onPress={() => void handleReload()}
          >
            {pageMessages.reload}
          </Button>
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
