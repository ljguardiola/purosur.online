import {
  PERMISSION_CATALOG,
  type PermissionArea,
  type PermissionDefinition,
  type PermissionKey,
} from "@purosur/contracts";
import { Checkbox, RadioGroup, TextField } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import { messages } from "./messages";

const rolesMessages = messages.settings.roles;
const formMessages = rolesMessages.form;

// The Alertas area's own two view permissions are mutually exclusive, drawn as a radio instead of
// two checkboxes; "dismiss_alerts_manually" is a plain third permission in the same area.
type AlertsViewOption = "none" | "view_branch_alerts" | "view_all_alerts";
const ALERTS_RADIO_OPTIONS: readonly [
  { value: AlertsViewOption; label: string },
  { value: AlertsViewOption; label: string },
  { value: AlertsViewOption; label: string },
] = [
  { value: "none", label: formMessages.alertsNoneOption },
  { value: "view_branch_alerts", label: formMessages.alertsBranchOption },
  { value: "view_all_alerts", label: formMessages.alertsAllOption },
];

function definitionsByArea(area: PermissionArea): PermissionDefinition[] {
  return PERMISSION_CATALOG.filter((definition) => definition.area === area);
}

type MissingArea<T extends readonly (readonly PermissionArea[])[]> = Exclude<
  PermissionArea,
  T[number][number]
>;

// Rejects, at type-check time, a column layout that leaves any permission area out.
function everyAreaPlaced<const T extends readonly (readonly PermissionArea[])[]>(
  columns: T & ([MissingArea<T>] extends [never] ? unknown : { missingArea: MissingArea<T> }),
): T {
  return columns;
}

// The three columns' area order, exactly as the design groups them.
const AREA_COLUMNS = everyAreaPlaced([
  ["cashRegister", "sale", "returns", "checkout"],
  ["stock", "purchasing", "catalog", "assembledProducts"],
  ["users", "fiscal", "reports", "alerts", "devices", "backups", "branch"],
]);

const ALERTS_TOTAL = definitionsByArea("alerts").length;

/** Empty (after trimming) or the Administrator role's own reserved name, case-insensitively. */
export function validateRoleName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return formMessages.nameRequired;
  }
  if (trimmed.toLowerCase() === rolesMessages.administratorRoleName.toLowerCase()) {
    return formMessages.nameReserved;
  }
  return undefined;
}

function PermissionRegisterBadge({
  marker,
}: {
  marker: Exclude<PermissionDefinition["registerMarker"], "none">;
}) {
  const isPinBadge = marker === "register_with_another_persons_pin";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-bone px-2 py-0.5 text-xs font-semibold text-ink-secondary">
      {isPinBadge && <KeyRound aria-hidden="true" className="size-3" />}
      {isPinBadge ? rolesMessages.pinBadgeLabel : rolesMessages.cashRegisterBadgeLabel}
    </span>
  );
}

function PermissionCheckboxRow({
  definition,
  checked,
  onToggle,
}: {
  definition: PermissionDefinition;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Checkbox isSelected={checked} onChange={onToggle}>
      <span className="flex flex-wrap items-center gap-2">
        <span>{rolesMessages.permissionLabels[definition.key]}</span>
        {checked && definition.registerMarker !== "none" && (
          <PermissionRegisterBadge marker={definition.registerMarker} />
        )}
      </span>
    </Checkbox>
  );
}

function AlertsAreaBlock({
  alertsView,
  dismissChecked,
  onChangeAlertsView,
  onToggleDismiss,
}: {
  alertsView: AlertsViewOption;
  dismissChecked: boolean;
  onChangeAlertsView: (value: AlertsViewOption) => void;
  onToggleDismiss: (checked: boolean) => void;
}) {
  const selectedCount = (alertsView !== "none" ? 1 : 0) + (dismissChecked ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold text-ink">
        {rolesMessages.areaLabels.alerts}{" "}
        <span className="font-normal text-ink-secondary">
          {formMessages.areaCount({ count: selectedCount, total: ALERTS_TOTAL })}
        </span>
      </h2>
      <RadioGroup
        label={rolesMessages.areaLabels.alerts}
        options={ALERTS_RADIO_OPTIONS}
        value={alertsView}
        onChange={onChangeAlertsView}
      />
      <Checkbox isSelected={dismissChecked} onChange={onToggleDismiss}>
        {formMessages.dismissAlertsOption}
      </Checkbox>
    </div>
  );
}

function PermissionAreaBlock({
  area,
  selected,
  onTogglePermission,
}: {
  area: PermissionArea;
  selected: ReadonlySet<PermissionKey>;
  onTogglePermission: (key: PermissionKey, checked: boolean) => void;
}) {
  const definitions = definitionsByArea(area);
  const selectedCount = definitions.filter((definition) => selected.has(definition.key)).length;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-bold text-ink">
        {rolesMessages.areaLabels[area]}{" "}
        <span className="font-normal text-ink-secondary">
          {formMessages.areaCount({ count: selectedCount, total: definitions.length })}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {definitions.map((definition) => (
          <PermissionCheckboxRow
            key={definition.key}
            definition={definition}
            checked={selected.has(definition.key)}
            onToggle={(checked) => onTogglePermission(definition.key, checked)}
          />
        ))}
      </div>
    </div>
  );
}

export type RoleFormProps = {
  name: string;
  onNameChange: (value: string) => void;
  nameError?: string;
  selected: ReadonlySet<PermissionKey>;
  onSelectedChange: (next: ReadonlySet<PermissionKey>) => void;
};

/**
 * The role form New and Edit both render: the name field, the "Referencias" block, every
 * permission area grouped into the design's three columns (with a running "N de M" count), the
 * Alertas area's radio and manual-dismiss checkbox, and the passkey reauthentication notice. Fully
 * controlled: the caller owns `name` and `selected`, so it decides what happens next (validation,
 * submission, pre-filling from a loaded role).
 */
export function RoleForm({
  name,
  onNameChange,
  nameError,
  selected,
  onSelectedChange,
}: RoleFormProps) {
  const alertsView: AlertsViewOption = selected.has("view_branch_alerts")
    ? "view_branch_alerts"
    : selected.has("view_all_alerts")
      ? "view_all_alerts"
      : "none";
  const dismissChecked = selected.has("dismiss_alerts_manually");

  function togglePermission(key: PermissionKey, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    onSelectedChange(next);
  }

  function changeAlertsView(value: AlertsViewOption) {
    const next = new Set(selected);
    next.delete("view_branch_alerts");
    next.delete("view_all_alerts");
    if (value !== "none") {
      next.add(value);
    }
    onSelectedChange(next);
  }

  function toggleDismissAlerts(checked: boolean) {
    togglePermission("dismiss_alerts_manually", checked);
  }

  return (
    <>
      <TextField
        kind="plain-text"
        label={formMessages.nameLabel}
        value={name}
        onChange={onNameChange}
        required
        {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
      />
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-bone p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PermissionRegisterBadge marker="register_with_another_persons_pin" />
          <p className="text-sm text-ink-secondary">{formMessages.referencesPinHelper}</p>
        </div>
        <p className="text-sm text-ink-secondary">{formMessages.administratorOnlyHelper}</p>
      </div>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {AREA_COLUMNS.map((column) => (
          // The column's own first area is a stable, unique key: the grouping never reorders and
          // no area appears in more than one column.
          <div key={column[0]} className="flex flex-col gap-6">
            {column.map((area) =>
              area === "alerts" ? (
                <AlertsAreaBlock
                  key={area}
                  alertsView={alertsView}
                  dismissChecked={dismissChecked}
                  onChangeAlertsView={changeAlertsView}
                  onToggleDismiss={toggleDismissAlerts}
                />
              ) : (
                <PermissionAreaBlock
                  key={area}
                  area={area}
                  selected={selected}
                  onTogglePermission={togglePermission}
                />
              ),
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-secondary">{formMessages.reauthNotice}</p>
    </>
  );
}
