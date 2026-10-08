import type { PermissionCatalogWire } from "@purosur/contracts";
import type { PermissionArea, PermissionKey } from "@purosur/domain";
import { Checkbox, Focusable, RadioGroup, Tag, Tooltip } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { AREA_LABELS, PERMISSION_LABELS } from "../platform/permission-labels";
import { type CataloguedPermission, withRequiredPermissions } from "./permission-catalog";
import { permissionRequirementNote } from "./permission-requirement-note";

type AlertsViewOption = "none" | "view_branch_alerts" | "view_all_alerts";
const ALERTS_RADIO_OPTIONS: readonly [
  { value: AlertsViewOption; label: string },
  { value: AlertsViewOption; label: string },
  { value: AlertsViewOption; label: string },
] = [
  { value: "none", label: "No ve alertas" },
  { value: "view_branch_alerts", label: "Ver alertas del local" },
  { value: "view_all_alerts", label: "Ver todas las alertas" },
];

function PermissionTags({ permission }: { permission: CataloguedPermission }) {
  if (permission.register_marker === "none") {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip description="Se usa en la caja.">
        <Focusable>
          {/* `img` is one of the few non-widget roles react-aria's Focusable accepts, and still announces aria-describedby on it. */}
          <Tag tone="neutral" role="img" aria-label="Caja">
            Caja
          </Tag>
        </Focusable>
      </Tooltip>
      {permission.register_marker === "register_with_another_persons_pin" && (
        <Tooltip description="En la caja, si quien atiende no tiene el permiso, lo autoriza con su PIN alguien que sí lo tenga.">
          <Focusable>
            <Tag tone="info" icon={<KeyRound aria-hidden="true" />} role="img" aria-label="PIN">
              PIN
            </Tag>
          </Focusable>
        </Tooltip>
      )}
    </div>
  );
}

function PermissionRow({
  permission,
  checked,
  requirementNote,
  onToggle,
}: {
  permission: CataloguedPermission;
  checked: boolean;
  requirementNote: string | undefined;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-border border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Checkbox
          name={permission.key}
          checked={checked}
          onCheckedChange={onToggle}
          disabled={requirementNote !== undefined}
          {...(requirementNote !== undefined ? { description: requirementNote } : {})}
        >
          {PERMISSION_LABELS[permission.key]}
        </Checkbox>
      </div>
      <PermissionTags permission={permission} />
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
        label={AREA_LABELS.alerts}
        options={ALERTS_RADIO_OPTIONS}
        value={alertsView}
        onChange={changeAlertsView}
      />
      <Checkbox name="dismissAlerts" checked={dismissChecked} onCheckedChange={toggleDismiss}>
        Cerrar alertas a mano
      </Checkbox>
    </div>
  );
}

function AreaRow({
  area,
  permissions,
  active,
  onSelect,
  selected,
}: {
  area: PermissionArea;
  permissions: CataloguedPermission[];
  active: boolean;
  onSelect: () => void;
  selected: ReadonlySet<PermissionKey>;
}) {
  const count = permissions.filter(({ key }) => selected.has(key)).length;
  const total = permissions.length;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={[
        "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-detail outline-none",
        "focus-visible:focus-ring",
        active ? "border border-border bg-surface" : "border border-transparent",
      ].join(" ")}
    >
      <span className={active ? "font-bold text-text-accent" : "text-text"}>
        {AREA_LABELS[area]}
      </span>
      <span className={count > 0 ? "font-bold text-text-accent" : "text-text-subtle"}>
        {`${count} de ${total}`}
      </span>
    </button>
  );
}

export type RoleEditorFormProps = {
  catalog: PermissionCatalogWire;
  nameField: ReactNode;
  selected: ReadonlySet<PermissionKey>;
  onSelectedChange: (next: ReadonlySet<PermissionKey>) => void;
  selectedArea: PermissionArea;
  onSelectedAreaChange: (area: PermissionArea) => void;
};

export function RoleEditorForm({
  catalog,
  nameField,
  selected,
  onSelectedChange,
  selectedArea,
  onSelectedAreaChange,
}: RoleEditorFormProps) {
  function changeSelected(next: ReadonlySet<PermissionKey>) {
    onSelectedChange(withRequiredPermissions(catalog, next));
  }

  function togglePermission(key: PermissionKey, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    changeSelected(next);
  }

  const selectedPermissions = catalog.find(({ area }) => area === selectedArea)?.permissions ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-border border-b bg-surface px-6 py-4">{nameField}</div>
      <div className="flex min-h-0 flex-1">
        <fieldset
          aria-label="Áreas de permisos"
          className="flex w-70 shrink-0 flex-col gap-1 overflow-y-auto border-border border-r bg-surface-subtle p-3"
        >
          {catalog.map(({ area, permissions }) => (
            <AreaRow
              key={area}
              area={area}
              permissions={permissions}
              active={area === selectedArea}
              onSelect={() => onSelectedAreaChange(area)}
              selected={selected}
            />
          ))}
        </fieldset>
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-surface px-6 py-5">
          <h2 className="shrink-0 text-text-accent text-heading">{AREA_LABELS[selectedArea]}</h2>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            {selectedArea === "alerts" ? (
              <AlertsAreaList selected={selected} onSelectedChange={changeSelected} />
            ) : (
              selectedPermissions.map((permission) => (
                <PermissionRow
                  key={permission.key}
                  permission={permission}
                  checked={selected.has(permission.key)}
                  requirementNote={permissionRequirementNote(catalog, permission.key, selected)}
                  onToggle={(checked) => togglePermission(permission.key, checked)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
