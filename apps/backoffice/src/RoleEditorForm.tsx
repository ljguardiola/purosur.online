import {
  isRoleNameTooLong,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  type PermissionArea,
  type PermissionDefinition,
  type PermissionKey,
  ROLE_NAME_MAX_LENGTH,
} from "@purosur/contracts";
import { Checkbox, Focusable, RadioGroup, Tag, TextField, Tooltip } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import type { CreateRoleFieldError, EditRoleFieldError } from "./rolesApi";

const ADMINISTRATOR_ROLE_NAME = "Administrador";

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

const PERMISSION_LABELS = {
  sell_and_charge: "Vender y cobrar, incluido pesar a mano y abrir y cerrar su propia sesión",
  view_sales_history: "Consultar el historial de ventas",
  close_anothers_register_session: "Cerrar la sesión de caja de otra persona",
  reprint_receipt: "Reimprimir un ticket",
  record_cash_in: "Registrar un ingreso de efectivo",
  record_cash_expense: "Registrar un gasto pagado en efectivo",
  withdraw_cash: "Retirar efectivo de la caja",
  override_line_price_or_discount: "Cambiar el precio o aplicar un descuento a una línea",
  apply_total_discount: "Aplicar un descuento sobre el total",
  void_sale: "Anular una venta",
  process_return: "Hacer devoluciones",
  authorize_late_defect_refund: "Autorizar el reembolso de un defecto fuera de plazo",
  confirm_refunds: "Confirmar reembolsos",
  record_initial_inventory: "Inventario inicial",
  view_stock_balances: "Ver saldos",
  perform_stock_counts: "Recuentos",
  adjust_stock: "Ajustes",
  record_stock_losses: "Pérdidas",
  manage_suppliers: "Proveedores",
  manage_purchase_presentations: "Presentaciones de compra",
  record_purchases: "Registrar compras",
  manage_freight: "Flete",
  manage_expiration_dates: "Vencimientos",
  manage_supplier_price_lists: "Cargar y revisar listas de proveedores",
  compare_prices_and_suggest_orders: "Comparación de precios y sugerencia de pedido",
  manage_purchase_orders: "Pedidos",
  receive_purchase_orders: "Recibir pedidos",
  manage_products_and_categories: "Productos y categorías",
  manage_prices_and_review: "Precios y su revisión",
  manage_promotions: "Promociones",
  manage_recipes: "Recetas",
  manage_batches: "Tandas",
  reset_user_pin: "Reiniciar el PIN",
  deactivate_users: "Desactivar usuarios",
  reactivate_users: "Reactivar usuarios",
  correct_register_clock: "Corregir el reloj de la caja",
  view_fiscal_documents: "Ver comprobantes, contingencias y puntos de venta",
  close_fiscal_tasks: "Cerrar tareas fiscales",
  change_fiscal_configuration: "Cambiar la configuración fiscal",
  view_reports: "Ver reportes",
  view_branch_alerts: "Ver alertas del local",
  view_all_alerts: "Ver todas las alertas",
  dismiss_alerts_manually: "Cerrar alertas a mano",
  enroll_register_devices: "Dar de alta cajas",
  revoke_register_devices: "Revocar cajas",
  view_bitlocker_key: "Consultar la clave de BitLocker",
  view_backups_and_rotate_key: "Ver backups y rotar la clave",
  recover_contingency_receipts: "Rescatar tickets de contingencia",
  configure_branch: "Configurar la sucursal",
} satisfies Record<PermissionKey, string>;

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

export function validateRoleName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Ingresá el nombre del rol.";
  }
  if (isRoleNameTooLong(trimmed)) {
    return `El nombre puede tener hasta ${ROLE_NAME_MAX_LENGTH} caracteres.`;
  }
  if (trimmed.toLowerCase() === ADMINISTRATOR_ROLE_NAME.toLowerCase()) {
    return "Ese nombre es del Administrador; elegí otro.";
  }
  return undefined;
}

export function roleFieldErrorMessage(
  field: CreateRoleFieldError | EditRoleFieldError,
): string | undefined {
  return field === "name" ? "Revisá el nombre del rol." : undefined;
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
    <div className="flex items-center gap-3 border-line border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Checkbox isSelected={checked} onChange={onToggle}>
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
      <Checkbox isSelected={dismissChecked} onChange={toggleDismiss}>
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
        "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none",
        "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-3 focus-visible:outline-brand-blue-strong",
        active ? "border border-line bg-surface-white" : "border border-transparent",
      ].join(" ")}
    >
      <span className={active ? "font-bold text-brand-blue-strong" : "text-ink"}>
        {AREA_LABELS[area]}
      </span>
      <span className={count > 0 ? "font-bold text-brand-blue-strong" : "text-ink-secondary"}>
        {`${count} de ${total}`}
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
          label="Nombre del rol"
          value={name}
          onChange={onNameChange}
          required
          {...(nameError ? { invalid: true, errorMessage: nameError } : {})}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <fieldset
          aria-label="Áreas de permisos"
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
            {AREA_LABELS[selectedArea]}
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
