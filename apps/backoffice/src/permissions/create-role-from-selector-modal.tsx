import type { CreationModalProps } from "../platform/creation-parts";
import type { RoleSummary } from "../platform/roles-api";
import { RoleEditorModal, type RoleEditorModalServices } from "./role-editor-modal";

export type CreateRoleFromSelectorModalServices = RoleEditorModalServices;

export type CreateRoleFromSelectorModalProps = CreationModalProps<RoleSummary> & {
  services?: CreateRoleFromSelectorModalServices | undefined;
};

export function CreateRoleFromSelectorModal({
  open,
  initialName,
  onCreated,
  onClose,
  onSessionEnded,
  services,
}: CreateRoleFromSelectorModalProps) {
  return open ? (
    <RoleEditorModal
      request={{ kind: "new", initialName }}
      onClose={onClose}
      onSaved={(created) => {
        if (created) {
          onCreated(created);
        }
      }}
      onSessionEnded={onSessionEnded}
      {...(services ? { services } : {})}
    />
  ) : null;
}
