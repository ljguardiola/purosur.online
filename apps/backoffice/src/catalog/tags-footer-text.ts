import type { ProductSummary, TagSummary } from "@purosur/contracts";
import { formatNumber, plural } from "@purosur/ui";

export function tagsFooterText(tags: TagSummary[], products: ProductSummary[]): string {
  const inactive = tags.filter((tag) => !tag.active).length;
  const tagIds = new Set(tags.map((tag) => tag.id));
  const carrying = products.filter((product) => product.tagIds.some((id) => tagIds.has(id))).length;
  return [
    plural(tags.length, {
      one: "1 distintivo",
      other: `${formatNumber(tags.length)} distintivos`,
    }),
    inactive > 0
      ? plural(inactive, { one: "1 inactivo", other: `${formatNumber(inactive)} inactivos` })
      : undefined,
    plural(carrying, { one: "1 producto", other: `${formatNumber(carrying)} productos` }),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
