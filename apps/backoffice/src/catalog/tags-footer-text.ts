import type { TagSummary } from "@purosur/contracts";
import { formatNumber, plural } from "@purosur/ui";

export function tagsFooterText(tags: TagSummary[], taggedProductCount: number): string {
  const inactive = tags.filter((tag) => !tag.active).length;
  return [
    plural(tags.length, {
      one: "1 distintivo",
      other: `${formatNumber(tags.length)} distintivos`,
    }),
    inactive > 0
      ? plural(inactive, { one: "1 inactivo", other: `${formatNumber(inactive)} inactivos` })
      : undefined,
    plural(taggedProductCount, {
      one: "1 producto",
      other: `${formatNumber(taggedProductCount)} productos`,
    }),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
