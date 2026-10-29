import type { CreationModalProps } from "../platform/creation-parts";
import type { RoleSummary } from "../platform/roles-api";
import { RoleEditorModal, type RoleEditorModalServices } from "./role-editor-modal";

export type RoleCreationModalProps = CreationModalProps<RoleSummary> & {
  services?: RoleEditorModalServices | undefined;
};

export function RoleCreationModal({
  open,
  initialName,
  onCreated,
  onClose,
  onSessionEnded,
  services,
}: RoleCreationModalProps) {
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
