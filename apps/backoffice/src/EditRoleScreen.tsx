import type { PermissionKey } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "./messages";
import { RoleForm, roleFieldErrorMessage, validateRoleName } from "./RoleForm";
import { failedRoleLoadStatus, type RoleLoadStatus, RoleLoadStatusView } from "./RoleLoadStatus";
import { editRole, fetchRole, fetchRoleEditChallenge, type RoleDetail } from "./rolesApi";
import { navigate } from "./router";
import { ScreenLayout } from "./ScreenLayout";
import { ROLES_LIST_PATH, sendToMyAccount } from "./settingsRoutes";

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
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: EditRoleScreenServices;
};

type LoadState = RoleLoadStatus | { kind: "loaded"; role: RoleDetail };

type FormNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number; offersReload: boolean }
  | { kind: "staleVersion" }
  | { kind: "reloadFailed" };

const rolesMessages = messages.settings.roles;
const pageMessages = rolesMessages.editRole;
const formMessages = rolesMessages.form;

/**
 * "Editar rol": pre-filled with a hand-made role's current name and permissions, confirming with a
 * passkey to save. Reserved to the Administrator: App.tsx only ever routes here for one, and a
 * `forbidden` read or save (a role change mid-session) sends the browser to Mi cuenta instead of
 * showing a notice.
 */
export function EditRoleScreen({ roleId, onSessionEnded, services }: EditRoleScreenProps) {
  const { fetchRole, fetchRoleEditChallenge, editRole, startAuthentication } =
    services ?? defaultEditRoleScreenServices;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
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
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setState(failedRoleLoadStatus(outcome));
    }
  }, [roleId, endSession, fetchRole, fillFrom]);

  useEffect(() => {
    void load();
  }, [load]);

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
      sendToMyAccount();
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
      sendToMyAccount();
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
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
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
      setNameError(roleFieldErrorMessage(outcome.field));
      if (roleFieldErrorMessage(outcome.field) === undefined) {
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
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
          <div className="flex flex-col justify-center">
            <p className="text-ink-secondary text-sm">{rolesMessages.rolePage.breadcrumb}</p>
            <h1 className="font-bold text-2xl text-brand-blue-strong">{pageMessages.heading}</h1>
          </div>
        </div>
      }
      bodyClassName="gap-6 p-6"
      footer={
        <div className="flex shrink-0 items-center justify-end gap-3 border-line border-t bg-surface-white px-8 py-4">
          <Button
            variant="secondary"
            icon={<X />}
            isDisabled={submitting}
            onPress={() => navigate(ROLES_LIST_PATH)}
          >
            {rolesMessages.rolePage.cancel}
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
      }
    >
      {notice?.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={pageMessages.attemptFailedTitle}
          detail={rolesMessages.rolePage.attemptFailedDetail}
        />
      )}
      {notice?.kind === "rateLimited" && (
        <InlineNotice
          tone="error"
          icon={<ShieldX />}
          title={rolesMessages.rateLimitedTitle}
          detail={rolesMessages.rateLimitedDetail({
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
          detail={rolesMessages.rolePage.attemptFailedDetail}
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
      <RoleLoadStatusView state={state} onRetry={() => void load()} />
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
    </ScreenLayout>
  );
}
