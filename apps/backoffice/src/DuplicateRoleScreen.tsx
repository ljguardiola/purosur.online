import type { PermissionKey } from "@purosur/contracts";
import { Button } from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { messages } from "./messages";
import { RoleCreationNoticeView, type RoleCreationServices, useRoleCreation } from "./RoleCreation";
import { RoleForm } from "./RoleForm";
import {
  failedRoleLoadStatus,
  type RoleLoadStatus,
  RoleLoadStatusView,
  RolesForbiddenNotice,
} from "./RoleLoadStatus";
import { withOneAlertView } from "./rolePermissions";
import { createRole, fetchRoles, type RoleSummary } from "./rolesApi";
import { navigate } from "./router";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { ROLES_LIST_PATH } from "./settingsRoutes";

export type DuplicateRoleScreenServices = RoleCreationServices & {
  fetchRoles: typeof fetchRoles;
};

export const defaultDuplicateRoleScreenServices: DuplicateRoleScreenServices = {
  fetchRoles,
  createRole,
  fetchSessionAuthorizationOptions,
  authorizeSession,
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

type LoadState = RoleLoadStatus | { kind: "loaded" };

const rolesMessages = messages.settings.roles;

function sourceDisplayName(role: RoleSummary): string {
  return role.isAdministrator ? rolesMessages.administratorRoleName : (role.name ?? "");
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
  const resolvedServices = services ?? defaultDuplicateRoleScreenServices;
  const { fetchRoles } = resolvedServices;
  const [state, setState] = useState<LoadState>(
    isAdministrator ? { kind: "loading" } : { kind: "forbidden" },
  );
  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the source role and
  // discard whatever the Administrator has typed so far.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);
  const creation = useRoleCreation({ services: resolvedServices, onSessionEnded: endSession });
  const { fill } = creation;

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await fetchRoles();
    if (outcome.kind === "ok") {
      const source = outcome.value.find((role) => role.id === roleId);
      if (!source) {
        setState({ kind: "notFound" });
        return;
      }
      fill(
        rolesMessages.duplicateRole.nameFromOriginal({ name: sourceDisplayName(source) }),
        withOneAlertView(source.permissionKeys as PermissionKey[]),
      );
      setState({ kind: "loaded" });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else {
      setState(failedRoleLoadStatus(outcome));
    }
  }, [roleId, endSession, fetchRoles, fill]);

  useEffect(() => {
    if (isAdministrator) {
      void load();
    }
  }, [isAdministrator, load]);

  if (state.kind === "forbidden") {
    return <RolesForbiddenNotice />;
  }

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{rolesMessages.rolePage.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">
            {rolesMessages.duplicateRole.heading}
          </h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        <RoleCreationNoticeView notice={creation.notice} />
        <RoleLoadStatusView state={state} onRetry={() => void load()} />
        {state.kind === "loaded" && (
          <RoleForm
            name={creation.name}
            onNameChange={creation.changeName}
            {...(creation.nameError ? { nameError: creation.nameError } : {})}
            selected={creation.selected}
            onSelectedChange={creation.setSelected}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-line border-t bg-surface-white px-8 py-4">
        <Button
          variant="secondary"
          icon={<X />}
          isDisabled={creation.submitting}
          onPress={() => navigate(ROLES_LIST_PATH)}
        >
          {rolesMessages.rolePage.cancel}
        </Button>
        <Button
          variant="primary"
          icon={<Check />}
          isDisabled={creation.submitting || state.kind !== "loaded"}
          onPress={() => {
            if (state.kind === "loaded") {
              void creation.submit();
            }
          }}
        >
          {rolesMessages.roleCreation.save}
        </Button>
      </div>
      {creation.modal}
    </>
  );
}
