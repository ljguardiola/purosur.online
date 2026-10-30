import type { TagProps } from "@purosur/ui";

export function pendingRefundPresentation(sentByCloud: boolean): {
  description: string;
  chip: { label: string; tone: TagProps["tone"] };
} {
  return {
    description: sentByCloud
      ? "Queda un reembolso pendiente que la nube envía a Mercado Pago al confirmarlo."
      : "Queda un reembolso pendiente: una persona lo hace por fuera de la caja.",
    chip: { label: "Pendiente", tone: "info" },
  };
}
