import type { TagSummary } from "@purosur/contracts";
import { formatNumber, plural } from "@purosur/ui";

export function tagsFooterText(tags: TagSummary[]): string {
  const inactive = tags.filter((tag) => !tag.active).length;
  const products = tags.reduce((sum, tag) => sum + tag.productCount, 0);
  return [
    plural(tags.length, {
      one: "1 distintivo",
      other: `${formatNumber(tags.length)} distintivos`,
    }),
    inactive > 0
      ? plural(inactive, { one: "1 inactivo", other: `${formatNumber(inactive)} inactivos` })
      : undefined,
    plural(products, { one: "1 producto", other: `${formatNumber(products)} productos` }),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
