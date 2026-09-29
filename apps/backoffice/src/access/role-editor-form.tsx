import {
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  type PermissionArea,
  type PermissionDefinition,
  type PermissionKey,
} from "@purosur/domain";
import { Checkbox, Focusable, RadioGroup, Tag, Tooltip } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { PERMISSION_LABELS } from "./permission-labels";

const AREA_LABELS = {
  cashRegister: "Caja",
  sale: "Venta",
  returns: "Devoluciones",
  checkout: "Cobro",
  stock: "Stock",
  purchasing: "Compras",
  catalog: "Catálogo",
  assembledProducts: "Productos armados",
  users: "Usuarios",
  fiscal: "Fiscal",
  reports: "Reportes",
  alerts: "Alertas",
  devices: "Dispositivos",
  backups: "Backups",
  branch: "Sucursal",
} satisfies Record<PermissionArea, string>;

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

function definitionsByArea(area: PermissionArea): PermissionDefinition[] {
  return PERMISSION_CATALOG.filter((definition) => definition.area === area);
}

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
      <Tooltip description="Se usa en la caja.">
        <Focusable>
          {/* `img` is one of the few non-widget roles react-aria's Focusable accepts, and still announces aria-describedby on it. */}
          <Tag tone="neutral" role="img" aria-label="Caja">
            Caja
          </Tag>
        </Focusable>
      </Tooltip>
      {definition.registerMarker === "register_with_another_persons_pin" && (
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
  definition,
  checked,
  onToggle,
}: {
  definition: PermissionDefinition;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-border border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Checkbox checked={checked} onCheckedChange={onToggle}>
          {PERMISSION_LABELS[definition.key]}
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
        label={AREA_LABELS.alerts}
        options={ALERTS_RADIO_OPTIONS}
        value={alertsView}
        onChange={changeAlertsView}
      />
      <Checkbox checked={dismissChecked} onCheckedChange={toggleDismiss}>
        Cerrar alertas a mano
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
  nameField: ReactNode;
  selected: ReadonlySet<PermissionKey>;
  onSelectedChange: (next: ReadonlySet<PermissionKey>) => void;
  selectedArea: PermissionArea;
  onSelectedAreaChange: (area: PermissionArea) => void;
};

export function RoleEditorForm({
  nameField,
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
      <div className="shrink-0 border-border border-b bg-surface px-6 py-4">{nameField}</div>
      <div className="flex min-h-0 flex-1">
        <fieldset
          aria-label="Áreas de permisos"
          className="flex w-70 shrink-0 flex-col gap-1 overflow-y-auto border-border border-r bg-surface-subtle p-3"
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
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-surface px-6 py-5">
          <h2 className="shrink-0 text-text-accent text-heading">{AREA_LABELS[selectedArea]}</h2>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
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
