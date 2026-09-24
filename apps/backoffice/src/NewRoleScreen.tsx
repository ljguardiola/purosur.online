import { Button } from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, X } from "lucide-react";
import { messages } from "./messages";
import { RoleCreationNoticeView, type RoleCreationServices, useRoleCreation } from "./RoleCreation";
import { RoleForm } from "./RoleForm";
import { createRole, fetchRoleCreationChallenge } from "./rolesApi";
import { navigate } from "./router";
import { ROLES_LIST_PATH } from "./settingsRoutes";

export type NewRoleScreenServices = RoleCreationServices;

export const defaultNewRoleScreenServices: NewRoleScreenServices = {
  fetchRoleCreationChallenge,
  createRole,
  startAuthentication,
};

export type NewRoleScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: NewRoleScreenServices;
};

const rolesMessages = messages.settings.roles;

/**
 * "Nuevo rol": names a role and hand-picks its permissions, confirming with a passkey to save it.
 * Reserved to the Administrator: App.tsx only ever routes here for one, and a non-Administrator
 * reaching `POST /roles` any other way is rejected by the server.
 */
export function NewRoleScreen({ onSessionEnded, services }: NewRoleScreenProps) {
  const creation = useRoleCreation({
    services: services ?? defaultNewRoleScreenServices,
    onSessionEnded,
  });

  return (
    <>
      <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
        <div className="flex flex-col justify-center">
          <p className="text-ink-secondary text-sm">{rolesMessages.rolePage.breadcrumb}</p>
          <h1 className="font-bold text-2xl text-brand-blue-strong">
            {rolesMessages.newRole.heading}
          </h1>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-6 p-6">
        <RoleCreationNoticeView notice={creation.notice} />
        <RoleForm
          name={creation.name}
          onNameChange={creation.changeName}
          {...(creation.nameError ? { nameError: creation.nameError } : {})}
          selected={creation.selected}
          onSelectedChange={creation.setSelected}
        />
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
          isDisabled={creation.submitting}
          onPress={() => void creation.submit()}
        >
          {rolesMessages.roleCreation.save}
        </Button>
      </div>
    </>
  );
}
