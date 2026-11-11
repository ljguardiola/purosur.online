import type { TagSummary } from "@purosur/contracts";
import { formatNumber, plural } from "@purosur/ui";

export function tagsFooterText(tags: TagSummary[], taggedProductCount: number): string {
  const inactive = tags.filter((tag) => !tag.active).length;
  return [
    plural(tags.length, {
      one: "1 etiqueta",
      other: `${formatNumber(tags.length)} etiquetas`,
    }),
    inactive > 0
      ? plural(inactive, { one: "1 inactiva", other: `${formatNumber(inactive)} inactivas` })
      : undefined,
    plural(taggedProductCount, {
      one: "1 producto",
      other: `${formatNumber(taggedProductCount)} productos`,
    }),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}
