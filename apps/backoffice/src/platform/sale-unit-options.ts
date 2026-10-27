import { Package, Scale } from "lucide-react";
import { createElement } from "react";

// Typed by hand: inferred from lucide, an icon's optional className fails the design system's Icon
// type under exactOptionalPropertyTypes.
export const SALE_UNIT_OPTIONS = [
  {
    value: "UNIT",
    icon: createElement<{ className?: string }>(Package),
    label: "Por unidad",
    description: "Se vende de a uno",
  },
  {
    value: "KG",
    icon: createElement<{ className?: string }>(Scale),
    label: "Por peso",
    description: "Se pesa en la balanza",
  },
] as const;
