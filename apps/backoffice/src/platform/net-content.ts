import type { NetContentUnit } from "@purosur/domain";
import { formatNumber } from "@purosur/ui";

export const NET_CONTENT_UNIT_LABELS = {
  G: "g",
  KG: "kg",
  ML: "ml",
  L: "l",
  UNIT: "u",
} satisfies Record<NetContentUnit, string>;

export function formatNetContent(netContent: { quantity: number; unit: NetContentUnit }): string {
  return `${formatNumber(netContent.quantity)} ${NET_CONTENT_UNIT_LABELS[netContent.unit]}`;
}
