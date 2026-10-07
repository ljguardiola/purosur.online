import type { AddProductOutcome, ScanProductOutcome } from "@purosur/contracts";
import { ElevatedNotice } from "@purosur/ui";
import type { LucideIcon } from "lucide-react";
import { Ban, Lock, PackageX, Scale, ScanBarcode, Tag, TriangleAlert } from "lucide-react";

export type ScanProblem =
  | Extract<
      ScanProductOutcome | AddProductOutcome,
      {
        kind:
          | "unknown_code"
          | "product_unavailable"
          | "no_price"
          | "sold_by_weight"
          | "not_permitted"
          | "installation_revoked"
          | "sale_has_payments";
      }
    >
  | { kind: "scan_failed" }
  | { kind: "add_failed" }
  | { kind: "search_failed" }
  | { kind: "change_failed" }
  | { kind: "remove_failed" }
  | { kind: "cancel_failed" }
  | { kind: "has_approved_payment" };

type Message = { icon: LucideIcon; title: string; help: string };

export function messageFor(problem: ScanProblem): Message {
  switch (problem.kind) {
    case "unknown_code":
      return {
        icon: ScanBarcode,
        title: "No hay ningún producto con ese código",
        help: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
      };
    case "product_unavailable":
      return {
        icon: PackageX,
        title: "Ese producto ya no se vende",
        help: "Buscalo de nuevo por nombre.",
      };
    case "no_price":
      return {
        icon: Tag,
        title: `${problem.product_name} no tiene precio`,
        help: "No se puede vender hasta que alguien con el permiso de precios se lo ponga en el backoffice.",
      };
    case "sold_by_weight":
      return {
        icon: Scale,
        title: `${problem.product_name} se vende por kilo`,
        help: "Esta caja todavía no vende productos por kilo.",
      };
    case "not_permitted":
      return {
        icon: Lock,
        title: "No tenés el permiso de vender y cobrar",
        help: "Quien administra los roles te lo puede dar en el backoffice.",
      };
    case "installation_revoked":
      return {
        icon: Ban,
        title: "Esta caja ya no puede empezar ventas",
        help: "Su instalación fue reemplazada o retirada desde el backoffice.",
      };
    case "scan_failed":
      return {
        icon: TriangleAlert,
        title: "No se pudo agregar el producto",
        help: "Probá escanearlo de nuevo.",
      };
    case "add_failed":
      return {
        icon: TriangleAlert,
        title: "No se pudo agregar el producto",
        help: "Probá elegirlo de nuevo.",
      };
    case "change_failed":
      return {
        icon: TriangleAlert,
        title: "No se pudo cambiar la cantidad",
        help: "Probá de nuevo.",
      };
    case "remove_failed":
      return {
        icon: TriangleAlert,
        title: "No se pudo quitar la línea",
        help: "Probá de nuevo.",
      };
    case "cancel_failed":
      return {
        icon: TriangleAlert,
        title: "No se pudo cancelar la venta",
        help: "Probá de nuevo.",
      };
    case "sale_has_payments":
      return {
        icon: Ban,
        title: "No se puede cambiar la venta",
        help: "Ya tiene un pago aprobado.",
      };
    case "has_approved_payment":
      return {
        icon: Ban,
        title: "No se puede cancelar la venta",
        help: "Ya tiene un pago aprobado.",
      };
    case "search_failed":
      return {
        icon: TriangleAlert,
        title: "No se pudo buscar el producto",
        help: "Probá escribirlo de nuevo.",
      };
  }
}

export function ScanProblemMessage({ problem }: { problem: ScanProblem | undefined }) {
  const message = problem === undefined ? undefined : messageFor(problem);
  return (
    <div className="absolute inset-x-0 top-full z-overlay mt-2">
      <ElevatedNotice
        notice={
          message === undefined
            ? undefined
            : { icon: <message.icon />, title: message.title, description: message.help }
        }
      />
    </div>
  );
}
