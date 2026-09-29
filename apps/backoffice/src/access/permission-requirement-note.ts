import { type PermissionKey, permissionsRequiring } from "@purosur/domain";
import { PERMISSION_LABELS } from "./permission-labels";

const LIST_FORMAT = new Intl.ListFormat("es-AR", { type: "conjunction" });

export function permissionRequirementNote(
  key: PermissionKey,
  selected: Iterable<PermissionKey>,
): string | undefined {
  const requiring = permissionsRequiring(key, selected);
  if (requiring.length === 0) {
    return undefined;
  }
  const names = LIST_FORMAT.format(requiring.map((requirer) => `«${PERMISSION_LABELS[requirer]}»`));
  return requiring.length === 1 ? `Lo requiere ${names}.` : `Lo requieren ${names}.`;
}
