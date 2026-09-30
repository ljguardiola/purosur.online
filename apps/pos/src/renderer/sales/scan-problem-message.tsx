import type { ScanProductOutcome } from "@purosur/contracts";
import type { LucideIcon } from "lucide-react";
import { Ban, Scale, ScanBarcode, Tag, TriangleAlert } from "lucide-react";

export type ScanProblem = Extract<
  ScanProductOutcome,
  {
    kind: "unknown_code" | "no_price" | "sold_by_weight" | "installation_revoked" | "unavailable";
  }
>;

type Message = { icon: LucideIcon; title: string; help: string };

function messageFor(problem: ScanProblem): Message {
  switch (problem.kind) {
    case "unknown_code":
      return {
        icon: ScanBarcode,
        title: "No hay ningún producto con ese código",
        help: "Buscalo por nombre. Si no aparece, falta darlo de alta en el backoffice.",
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
    case "installation_revoked":
      return {
        icon: Ban,
        title: "Esta caja ya no puede empezar ventas",
        help: "Su instalación fue reemplazada o retirada desde el backoffice.",
      };
    case "unavailable":
      return {
        icon: TriangleAlert,
        title: "No se pudo agregar el producto",
        help: "Probá escanearlo de nuevo.",
      };
  }
}

// The live region stays mounted while empty: one that arrives already holding its text is not
// announced.
export function ScanProblemMessage({ problem }: { problem: ScanProblem | undefined }) {
  const message = problem === undefined ? undefined : messageFor(problem);
  return (
    <div role="status" className="absolute inset-x-0 top-full z-overlay mt-2">
      {message === undefined ? null : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-6 text-center shadow-lg">
          <message.icon aria-hidden="true" className="size-icon-3xl text-text-subtle" />
          <p className="text-heading text-text">{message.title}</p>
          <p className="text-body text-text-subtle">{message.help}</p>
        </div>
      )}
    </div>
  );
}
