import type { PermissionKey } from "@purosur/domain";
import { InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { TriangleAlert } from "lucide-react";
import { PERMISSION_LABELS } from "../access/permission-labels";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudData } from "../platform/use-cloud-query";

const UNCOVERED_ACTIONS: Partial<Record<PermissionKey, string>> = {
  sell_and_charge: "vender y cobrar",
  view_sales_history: "consultar el historial de ventas",
  close_anothers_register_session: "cerrar la sesión de caja de otra persona",
  reprint_receipt: "reimprimir tickets",
  record_cash_in: "registrar ingresos de efectivo",
  record_cash_expense: "registrar gastos pagados en efectivo",
  withdraw_cash: "retirar efectivo de la caja",
  override_line_price_or_discount: "cambiar el precio o aplicar un descuento a una línea",
  apply_total_discount: "aplicar descuentos sobre el total",
  void_sale: "anular ventas",
  process_return: "hacer devoluciones",
  authorize_late_defect_refund: "autorizar el reembolso de un defecto fuera de plazo",
  confirm_refunds: "confirmar reembolsos",
  record_initial_inventory: "cargar el inventario inicial",
  correct_register_clock: "corregir el reloj de la caja",
};

function uncoveredActionLine(key: PermissionKey): string {
  return `Nadie puede ${UNCOVERED_ACTIONS[key] ?? PERMISSION_LABELS[key].toLocaleLowerCase("es-AR")}.`;
}

export function RegisterCoverageNotice({ coverage }: { coverage: CloudData<PermissionKey[]> }) {
  if (coverage.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (coverage.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(coverage, "las acciones de la caja sin cubrir")} />;
  }
  if (coverage.value.length === 0) {
    return null;
  }
  return (
    <InlineNotice
      tone="warning"
      icon={<TriangleAlert />}
      title="Hay acciones de la caja que nadie del local puede hacer"
      description={[
        ...coverage.value.map(uncoveredActionLine),
        "Para cubrirlas, sumá el permiso a un rol con usuarios activos del local.",
      ].join("\n")}
    />
  );
}
