import {
  isRoleNameTooLong,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  type PermissionArea,
  type PermissionDefinition,
  type PermissionKey,
} from "@purosur/contracts";
import { Checkbox, Focusable, RadioGroup, Tag, TextField, Tooltip } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import { messages } from "./messages";
import type { CreateRoleFieldError, EditRoleFieldError } from "./rolesApi";

const rolesMessages = messages.settings.roles;
const formMessages = rolesMessages.roleEditor.form;
const editorMessages = rolesMessages.roleEditor;

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

/**
 * Empty (after trimming), too long for a role name, or the Administrator role's own
 * reserved name, case-insensitively.
 */
export function validateRoleName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return formMessages.nameRequired;
  }
  if (isRoleNameTooLong(trimmed)) {
    return formMessages.nameTooLong;
  }
  if (trimmed.toLowerCase() === rolesMessages.administratorRoleName.toLowerCase()) {
    return formMessages.nameReserved;
  }
  return undefined;
}

/** The name field's own error for a save the server rejected on that field; none for any other. */
export function roleFieldErrorMessage(
  field: CreateRoleFieldError | EditRoleFieldError,
): string | undefined {
  return field === "name" ? formMessages.nameFieldError : undefined;
}

/** How many of an area's permissions `selected` holds, out of how many it has. */
export function areaSelectedCount(
  area: PermissionArea,
  selected: ReadonlySet<PermissionKey>,
): { count: number; total: number } {
  const definitions = definitionsByArea(area);
  return {
    count: definitions.filter((d) => selected.has(d.key)).length,
    total: definitions.length,
  };
}

function PermissionTags({ definition }: { definition: PermissionDefinition }) {
  if (definition.registerMarker === "none") {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip description={editorMessages.cashRegisterTagTooltip}>
        <Focusable>
          {/* `img` is one of the few non-widget roles react-aria's own Focusable accepts, and one
              of the roles it still announces aria-describedby on: this tag carries no action of
              its own, only a name and (via the tooltip) a longer description. */}
          <Tag tone="neutral" role="img" aria-label={editorMessages.cashRegisterTag}>
            {editorMessages.cashRegisterTag}
          </Tag>
        </Focusable>
      </Tooltip>
      {definition.registerMarker === "register_with_another_persons_pin" && (
        <Tooltip description={editorMessages.pinTagTooltip}>
          <Focusable>
            <Tag
              tone="info"
              icon={<KeyRound aria-hidden="true" />}
              role="img"
              aria-label={editorMessages.pinTag}
            >
              {editorMessages.pinTag}
            </Tag>
          </Focusable>
        </Tooltip>
      )}
    </div>
  );
}

function PermissionRow({
  definition,
  checked,
  onToggle,
}: {
  definition: PermissionDefinition;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-line border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Checkbox isSelected={checked} onChange={onToggle}>
          {rolesMessages.permissionLabels[definition.key]}
        </Checkbox>
      </div>
      <PermissionTags definition={definition} />
    </div>
  );
}

function AlertsAreaList({
  selected,
  onSelectedChange,
}: {
  selected: ReadonlySet<PermissionKey>;
  onSelectedChange: (next: ReadonlySet<PermissionKey>) => void;
}) {
  const alertsView: AlertsViewOption = selected.has("view_branch_alerts")
    ? "view_branch_alerts"
    : selected.has("view_all_alerts")
      ? "view_all_alerts"
      : "none";
  const dismissChecked = selected.has("dismiss_alerts_manually");

  function changeAlertsView(value: AlertsViewOption) {
    const next = new Set(selected);
    next.delete("view_branch_alerts");
    next.delete("view_all_alerts");
    if (value !== "none") {
      next.add(value);
    }
    onSelectedChange(next);
  }

  function toggleDismiss(checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add("dismiss_alerts_manually");
    } else {
      next.delete("dismiss_alerts_manually");
    }
    onSelectedChange(next);
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <RadioGroup
        label={rolesMessages.areaLabels.alerts}
        options={ALERTS_RADIO_OPTIONS}
        value={alertsView}
        onChange={changeAlertsView}
      />
      <Checkbox isSelected={dismissChecked} onChange={toggleDismiss}>
        {formMessages.dismissAlertsOption}
      </Checkbox>
    </div>
  );
}

function AreaRow({
  area,
  active,
  onSelect,
  selected,
}: {
  area: PermissionArea;
  active: boolean;
  onSelect: () => void;
  selected: ReadonlySet<PermissionKey>;
}) {
  const { count, total } = areaSelectedCount(area, selected);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={[
        "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none",
        "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-3 focus-visible:outline-brand-blue-strong",
        active ? "border border-line bg-surface-white" : "border border-transparent",
      ].join(" ")}
    >
      <span className={active ? "font-bold text-brand-blue-strong" : "text-ink"}>
        {rolesMessages.areaLabels[area]}
      </span>
      <span className={count > 0 ? "font-bold text-brand-blue-strong" : "text-ink-secondary"}>
        {formMessages.areaCount({ count, total })}
      </span>
    </button>
  );
}

export type RoleEditorFormProps = {
  name: string;
  onNameChange: (value: string) => void;
  nameError?: string;
  selected: ReadonlySet<PermissionKey>;
  onSelectedChange: (next: ReadonlySet<PermissionKey>) => void;
  selectedArea: PermissionArea;
  onSelectedAreaChange: (area: PermissionArea) => void;
};

/**
 * The role editor's name field plus its two-pane permission picker: the areas pane on the left
 * (every area with its own "n de m" count, the shown one highlighted) and the selected area's
 * permissions on the right, a bordered checkbox list with Caja/PIN tags. Fully controlled: the
 * caller owns `name`, `selected` and `selectedArea`.
 */
export function RoleEditorForm({
  name,
  onNameChange,
  nameError,
  selected,
  onSelectedChange,
  selectedArea,
  onSelectedAreaChange,
}: RoleEditorFormProps) {
  function togglePermission(key: PermissionKey, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    onSelectedChange(next);
  }

  const definitions = definitionsByArea(selectedArea);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-line border-b bg-surface-white px-6 py-4">
        <TextField
          kind="plain-text"
          label={formMessages.nameLabel}
          value={name}
          onChange={onNameChange}
          required
          {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <fieldset
          aria-label={formMessages.areasGroupLabel}
          className="flex w-70 shrink-0 flex-col gap-1 overflow-y-auto border-line border-r bg-surface-bone p-3"
        >
          {PERMISSION_AREAS.map((area) => (
            <AreaRow
              key={area}
              area={area}
              active={area === selectedArea}
              onSelect={() => onSelectedAreaChange(area)}
              selected={selected}
            />
          ))}
        </fieldset>
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-surface-white px-6 py-5">
          <h2 className="shrink-0 font-bold text-brand-blue-strong text-xl">
            {rolesMessages.areaLabels[selectedArea]}
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-line">
            {selectedArea === "alerts" ? (
              <AlertsAreaList selected={selected} onSelectedChange={onSelectedChange} />
            ) : (
              definitions.map((definition) => (
                <PermissionRow
                  key={definition.key}
                  definition={definition}
                  checked={selected.has(definition.key)}
                  onToggle={(checked) => togglePermission(definition.key, checked)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
